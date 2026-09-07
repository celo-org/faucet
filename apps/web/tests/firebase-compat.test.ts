import { describe, expect, it } from 'vitest'
import firebase from 'firebase/compat/app'
import 'firebase/compat/auth'
import 'firebase/compat/database'

// Regression: a dependency bump left two copies of @firebase/app in the
// lockfile. The compat auth and database packages resolve @firebase/app as a
// peer, so their components registered on one instance while
// firebase/compat/app initialised the other, and every server-side call to
// firebase.auth() threw "Component auth has not been registered yet". That
// took the whole faucet down while every other test stayed green, because
// they all mock this module. No network, no credentials: initialising the
// app and resolving the services is enough to surface a split install.
describe('firebase compat services', () => {
  const app = firebase.apps.length
    ? firebase.app()
    : firebase.initializeApp({
        apiKey: 'test',
        authDomain: 'test.firebaseapp.com',
        databaseURL: 'https://test.firebaseio.com',
        projectId: 'test',
      })

  it('registers auth on the same app instance that compat/app initialises', () => {
    expect(() => app.auth()).not.toThrow()
  })

  it('registers database on the same app instance that compat/app initialises', () => {
    expect(() => app.database()).not.toThrow()
  })
})
