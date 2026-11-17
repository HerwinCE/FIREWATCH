import sys, asyncio, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/fw/mockup/index.html'
async def main(shots, out='screenshots'):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        errs = []
        for name, hash_, w, h, wait, extra in shots:
            pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            await pg.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
            pg.on('console', lambda m, n=name: errs.append(f'{n}: {m.text}') if m.type == 'error' else None)
            pg.on('pageerror', lambda e, n=name: errs.append(f'{n}: PAGEERROR {e}'))
            await pg.goto(URL + hash_)
            await pg.wait_for_timeout(wait)
            if extra:
                for js in extra:
                    await pg.evaluate(js); await pg.wait_for_timeout(700)
            await pg.screenshot(path=f'{out}/{name}.png')
            await pg.close()
        await b.close()
        print('\n'.join(errs) or 'no errors')
shots = json.loads(sys.argv[1]); out = sys.argv[2] if len(sys.argv) > 2 else 'screenshots'
asyncio.run(main(shots, out))
