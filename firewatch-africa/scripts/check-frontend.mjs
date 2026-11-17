import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173/');
 await page.getByText('505 826',{exact:true}).waitFor({timeout:30000});
 await page.waitForFunction(()=>document.querySelector('.mapboxgl-canvas'));
 await page.waitForTimeout(12000);
 console.log('map status: '+await page.locator('.map-note').first().innerText());
 await page.screenshot({path:'screenshots/frontend-dashboard-desktop.png',fullPage:true});
 for(const route of ['carte','gabon','historique','comparaison','evenements','zones','methodologie','assistant','parametres']){
  await page.goto('http://localhost:5173/#'+route);
  await page.locator('main h3, main .map').first().waitFor();
  console.log(route+': rendered');
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://localhost:5173/#dashboard');
 await page.getByText('505 826',{exact:true}).waitFor();
 await page.screenshot({path:'screenshots/frontend-dashboard-mobile.png',fullPage:true});
 console.log(JSON.stringify({pageErrors:errors,horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)}));
 if(errors.length)process.exitCode=1;
}finally{await browser.close();}
