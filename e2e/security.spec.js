import { test, expect } from '@playwright/test'
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const origin='https://sajbwbtqlassnipnbdkk.supabase.co'
const hostile='<img src=x onerror=alert(1)>'
async function signedIn(page, {provider, intentUser, age=0}={}) {
  const user={id,email:'test@example.com',aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),identities:provider?[{provider}]:[]}
  await page.addInitScript(({user,origin,provider,intentUser,age})=>{
    const now=Math.floor(Date.now()/1000)
    const encode=value=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
    const claims={sub:user.id,iss:`${origin}/auth/v1`,aud:'authenticated',role:'authenticated',is_anonymous:false,exp:now+3600,iat:now,amr:[{method:provider?'oauth':'password',timestamp:now-age}]}
    const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode(claims)}.dGVzdA`
    localStorage.setItem(`sb-${new URL(origin).hostname.split('.')[0]}-auth-token`,JSON.stringify({access_token:token,refresh_token:'test-refresh-token',expires_at:now+3600,user,token_type:'bearer'}))
    if(intentUser) sessionStorage.setItem('8bitspace-delete-intent',JSON.stringify({userId:intentUser,startedAt:(now-1)*1000}))
  },{user,origin,provider,intentUser,age})
  await page.route(`${origin}/**`,async route=>{
    const path=new URL(route.request().url()).pathname
    let data=[]
    if(path.includes('/auth/')) data=user
    if(path.endsWith('/profiles')) data={id,display_name:hostile,avatar_url:'/avatars/avatar-01.jpeg',theme:'pixel-night',notifications:true}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
  })
}
test('anonymous visitors cannot see the dashboard; security headers are sent',async({page})=>{
  const response=await page.goto('/')
  await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Create New',exact:true})).toHaveCount(0)
  expect(response.headers()['x-frame-options']).toBe('DENY')
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'")
  expect(response.headers()['referrer-policy']).toBe('no-referrer')
})

for (const provider of ['google','github']) {
  test(`${provider} deletion offers provider verification without a password`,async({page})=>{
    await signedIn(page,{provider})
    await page.goto('/')
    await page.getByRole('button',{name:'Open profile photo menu'}).click()
    await page.getByRole('tab',{name:'Account',exact:true}).click()
    await page.getByRole('button',{name:'Delete my account'}).click()
    const dialog=page.getByRole('alertdialog')
    await expect(dialog.getByLabel('Current password')).toHaveCount(0)
    await expect(dialog.getByRole('button',{name:`Verify with ${provider==='google'?'Google':'GitHub'}`})).toBeVisible()
    await dialog.locator('input').fill('DELETE ACCOUNT')
    await expect(dialog.getByRole('button',{name:'Delete account',exact:true})).toBeDisabled()
  })
  test(`${provider} callback requires final confirmation and supports retry after server rejection`,async({page})=>{
    await page.setViewportSize({width:390,height:844})
    await signedIn(page,{provider,intentUser:id})
    const requests=[]
    await page.route(`${origin}/functions/v1/delete-account`,async route=>{
      requests.push(route.request().postDataJSON())
      await route.fulfill({status:401,json:{error:'Please verify with Google or GitHub again, then confirm deletion.'}})
    })
    await page.goto('/?auth=callback')
    const dialog=page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    expect(requests).toHaveLength(0)
    await expect(dialog.getByRole('button',{name:'Delete account',exact:true})).toBeDisabled()
    await dialog.locator('input').fill('DELETE ACCOUNT')
    await dialog.getByRole('button',{name:'Delete account',exact:true}).click()
    await expect(dialog.getByRole('alert')).toContainText('verify with Google or GitHub again')
    expect(requests).toEqual([{password:'',verification:'oauth',expectedUserId:id,confirmation:'DELETE ACCOUNT'}])
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
    await page.screenshot({path:`.browser-check/${provider}-deletion-mobile.png`,fullPage:true,animations:'disabled'})
  })
}

for(const scenario of ['different account','expired OAuth','cancelled']) {
  test(`deletion callback fails safely for ${scenario}`,async({page})=>{
    await signedIn(page,{provider:'google',intentUser:scenario==='different account'?'other-user':id,age:scenario==='expired OAuth'?3600:0})
    await page.goto(scenario==='cancelled'?'/?auth=callback&error=access_denied':'/?auth=callback')
    await expect(page).toHaveURL('http://127.0.0.1:4173/')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(await page.evaluate(()=>sessionStorage.getItem('8bitspace-delete-intent'))).toBeNull()
  })
}

test('successful verified deletion returns to sign-in only after explicit confirmation',async({page})=>{
  await signedIn(page,{provider:'github',intentUser:id})
  let deleted=false
  await page.route(`${origin}/functions/v1/delete-account`,async route=>{
    deleted=true
    await route.fulfill({json:{deleted:true}})
  })
  await page.goto('/?auth=callback')
  const dialog=page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  expect(deleted).toBe(false)
  await dialog.locator('input').fill('DELETE ACCOUNT')
  await dialog.getByRole('button',{name:'Delete account',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible()
  expect(deleted).toBe(true)
})
test('short signup passwords are blocked before sending a request',async({page})=>{
  let submitted=false
  await page.route(`${origin}/auth/v1/signup`,async route=>{submitted=true;await route.abort()})
  await page.goto('/')
  await page.getByRole('button',{name:'NEW HERE? CREATE AN ACCOUNT →'}).click()
  await page.getByLabel('Email address').fill('test@example.com')
  await page.getByLabel('Password',{exact:true}).fill('short')
  await page.getByRole('button',{name:'Create account',exact:true}).click()
  expect(await page.getByLabel('Password',{exact:true}).evaluate(input=>input.validity.tooShort)).toBe(true)
  expect(submitted).toBe(false)
})
test('untrusted profile text stays inert and account deletion requires a password',async({page})=>{
  const dialogs=[]
  page.on('dialog',dialog=>{dialogs.push(dialog.message());dialog.dismiss()})
  await signedIn(page)
  await page.goto('/')
  await page.getByRole('button',{name:'Open profile photo menu'}).click()
  await page.getByRole('tab',{name:'Account',exact:true}).click()
  await expect(page.getByLabel('Display name')).toHaveValue(hostile)
  await page.getByRole('button',{name:'Delete my account'}).click()
  const dialog=page.getByRole('alertdialog')
  await dialog.locator('input').first().fill('DELETE ACCOUNT')
  await expect(dialog.getByRole('button',{name:'Delete account',exact:true})).toBeDisabled()
  await dialog.getByLabel('Current password').fill('test-password-only')
  await expect(dialog.getByRole('button',{name:'Delete account',exact:true})).toBeEnabled()
  expect(dialogs).toEqual([])
  await page.screenshot({path:'.browser-check/account-security.png',fullPage:true,animations:'disabled'})
})

for (const provider of ['google','github']) {
  test(`${provider} sign-in sends PKCE and returns only to this app`,async({page})=>{
    await page.route(`${origin}/auth/v1/settings`,route=>route.fulfill({json:{external:{google:true,github:true}}}))
    await page.route(`${origin}/auth/v1/authorize**`,route=>route.fulfill({contentType:'text/html',body:'<h1>Provider redirect captured</h1>'}))
    await page.goto('/')
    await page.getByRole('button',{name:`Continue with ${provider==='google'?'Google':'GitHub'}`}).click()
    await expect(page.getByRole('heading',{name:'Provider redirect captured'})).toBeVisible()
    const url=new URL(page.url())
    expect(url.searchParams.get('provider')).toBe(provider)
    expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:4173/?auth=callback')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('code_challenge_method')?.toLowerCase()).toBe('s256')
  })
}
test('disabled provider keeps the user on the login page with a useful error',async({page})=>{
  await page.route(`${origin}/auth/v1/settings`,route=>route.fulfill({json:{external:{google:false,github:false}}}))
  await page.goto('/')
  await page.getByRole('button',{name:'Continue with Google'}).click()
  await expect(page.getByRole('status')).toContainText('not available yet')
  await expect(page.getByRole('button',{name:'Continue with Google'})).toBeEnabled()
})
test('cancelled OAuth removes callback errors and offers sign-in again',async({page})=>{
  await page.goto('/?auth=callback&error=access_denied&error_description=untrusted-content')
  await expect(page.getByRole('status')).toContainText('cancelled')
  await expect(page).toHaveURL('http://127.0.0.1:4173/')
  await expect(page.getByText('untrusted-content')).toHaveCount(0)
})
test('OAuth login fits a mobile screen',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/')
  await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Continue with GitHub'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.screenshot({path:'.browser-check/oauth-mobile.png',fullPage:true,animations:'disabled'})
})
