import { getAnalytics } from "firebase/analytics"
import firebase from "firebase/compat/app"
import "firebase/compat/database"
import { NETWORK, RequestRecord, RequestStatus } from "./faucet-interfaces"
import firebaseConfig from "./firebase-config"
// Code in this file is sent to the browser.
// Code in FirebaseServerSide.ts is not sent to the browser.

async function getFirebase() {
  if (!firebase.apps.length) {
    const app = firebase.initializeApp(firebaseConfig)
    getAnalytics(app)
  }
  return firebase
}

async function getDB(): Promise<firebase.database.Database> {
  return (await getFirebase()).database()
}

// Don't do this. It hangs next.js build process: https://github.com/zeit/next.js/issues/6824
// const db = firebase.database()

export default async function subscribeRequest(
  key: string,
  onChange: (record: RequestRecord) => void
) {
  const ref: firebase.database.Reference = (await getDB()).ref(`${NETWORK}/requests/${key}`)

  const listener = ref.on("value", (snap) => {
    const record = snap.val() as RequestRecord

    if (record) {
      onChange(record)
    }

    if (record.status === RequestStatus.Done || record.status === RequestStatus.Failed) {
      ref.off("value", listener)
    }
  })
}
