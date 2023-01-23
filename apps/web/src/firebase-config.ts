const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_KEY,
    authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PID}.firebaseapp.com`,
    databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PID}.firebaseio.com`,
    projectId: `${process.env.NEXT_PUBLIC_FIREBASE_PID}`,
    storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PID}.appspot.com`,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASURE_ID,
}

export default config