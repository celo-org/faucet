import { getAnalytics } from 'firebase/analytics'
import firebase from 'firebase/compat/app'
import 'firebase/compat/database'
import { Network, RequestRecord, RequestStatus } from 'types'
import { config } from './firebase-config'
// Code in this file is sent to the browser.
// Code in FirebaseServerSide.ts is not sent to the browser.

async function getFirebase() {
  if (!firebase.apps.length) {
    const app = firebase.initializeApp(config)
    getAnalytics(app)
  }
  return firebase
}

async function getDB(): Promise<firebase.database.Database> {
  return (await getFirebase()).database()
}

// Don't do this. It hangs next.js build process: https://github.com/zeit/next.js/issues/6824
// const db = firebase.database()

export async function subscribeRequest(
  key: string,
  onChange: (record: RequestRecord) => void,
  network: Network,
) {
  const ref: firebase.database.Reference = (await getDB()).ref(
    `${network}/requests/${key}`,
  )

  const listener = ref.on('value', (snap) => {
    const record = snap.val() as RequestRecord

    if (record) {
      onChange(record)
    }

    if (
      record.status === RequestStatus.Done ||
      record.status === RequestStatus.Failed
    ) {
      ref.off('value', listener)
    }
  })
}
