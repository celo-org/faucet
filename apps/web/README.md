## Faucet Web App

### Local Dev with GitHub OAUTH

- Create your own GitHub OAuth application (https://github.com/settings/applications/new)
- Add whatever name you'd like
- Set the Homepage URL to be http://localhost:3000, or whatever local URL you're using for development
- Set the Authorization callback URL to be http://localhost:3000/api/auth/callback/github
- Click 'Register application'
- Create a `.env.local` file inside the `faucet/apps/web/` directory
- Copy the Client ID and add it the `.env.local` file as GITHUB_ID (GITHUB_ID=<your_client_id>)
- Inside the 'Client secrets' section, click 'Generate a new client secret'
- Copy the secret and add it the `.env.local` file as GITHUB_SECRET (GITHUB_SECRET=<your_secret>)
