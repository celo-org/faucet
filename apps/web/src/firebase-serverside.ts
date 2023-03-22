import firebase from "firebase/compat/app"
import "firebase/compat/auth"
import "firebase/compat/database"
import {
  Address,
  AuthLevel,
  RequestedTokenSet,
  RequestRecord,
  RequestStatus,
  RequestType
} from "./faucet-interfaces"
import firebaseConfig from "./firebase-config"

async function getFirebase() {
  if (!firebase.apps.length) {

    firebase.initializeApp(firebaseConfig)
    const loginUsername = process.env.FIREBASE_LOGIN_USERNAME
    const loginPassword = process.env.FIREBASE_LOGIN_PASSWORD
    if (loginUsername === undefined || loginUsername === null || loginUsername.length === 0 || loginPassword === undefined) {
      throw new Error("Login username or password is empty")
    }
    try {
      // Source: https://firebase.google.com/docs/auth
      await firebase.auth().signInWithEmailAndPassword(loginUsername, loginPassword)
    } catch (e) {
      console.error(`Fail to login into Firebase: ${e}`)
      throw e
    }
  }
  return firebase
}

async function getDB(): Promise<firebase.database.Database> {
  return (await getFirebase()).database()
}

export async function sendRequest(
  beneficiary: Address,
  skipStables: boolean,
  network: string,
  authLevel: AuthLevel
) {
  const newRequest: RequestRecord = {
    beneficiary,
    status: RequestStatus.Pending,
    type: RequestType.Faucet,
    tokens: skipStables ? RequestedTokenSet.Celo : RequestedTokenSet.Stables,
    authLevel,
  }

  try {
    const db = await getDB()
    const ref: firebase.database.Reference = await db.ref(`${network}/requests`).push(newRequest)
    return ref.key
  } catch (e) {
    console.error(`Error while sendRequest: ${e}`)
    throw e
  }
}
