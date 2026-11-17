"""Vérification d'intégration en lecture seule sur la base locale."""
import asyncio
import httpx
from sqlalchemy import text
from app.main import app
from app.database import engine

async def main():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        for params in ({}, {'sensor':'MODIS'}, {'scope':'gabon'}, {'zoom':10,'scope':'gabon'},
                       {'bbox':'170,-50,-170,50'}, {'start_date':'2026-11-12','end_date':'2026-11-12'}):
            response = await client.get('/api/map/observations',params=params)
            assert response.status_code == 200, response.text
            body=response.json()
            assert sum(f['properties']['count'] for f in body['features']) == body['meta']['total']
            assert not body['meta']['partial']
            assert len(body['features'])<=5000
            print(params,body['meta'])
        for params in ({'bbox':'nan,-1,4,5'}, {'start_date':'2026-11-14','end_date':'2026-11-10'}, {'sensor':'INVALID'}):
            assert (await client.get('/api/map/observations',params=params)).status_code==422
        world=(await client.get('/api/map/observations')).json()
        async with engine.connect() as conn:
            count=(await conn.execute(text('SELECT COUNT(*) FROM firewatch.detections'))).scalar_one()
        assert world['meta']['represented']==count
    await engine.dispose()
    print('Cartographie : contrôles réussis.')

if __name__=='__main__':
    asyncio.run(main())
