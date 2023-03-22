import { Inter } from '@next/font/google'
import { FC } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import Image from 'next/image'
import styles from 'styles/Github.module.css'

export const inter = Inter({ subsets: ['latin'] })

export const GitHubAuth: FC = () => {
  const { data: session } = useSession()

  return (
    <div className={styles.gitHubAuthContainer}>
      {session?.user
        ? <div className={styles.authenticatedContainer}>
            <span className={inter.className}>Authenticated with GitHub</span>
            <button onClick={() => signOut()}>Sign out of GitHub</button>
          </div>
        : <button className={styles.signInButton} onClick={() => signIn('github')}>
            Sign in with GitHub
            <Image width={20} height={20} alt="" src="/github_white.png" />
          </button>
      }
    </div>
  )
}
