# TrueShuffle: An open-source music shuffling web application for Spotify
![alt text](/assets/images/meta-image.jpeg)

## Motivation
After having Spotify play the same 40-50 songs repetitively from a playlist well over 1000 songs, I was done with their shuffle algorithm. TrueShuffle is a completely front-end based web application that interacts with the Spotify API to bring truly unbiased music shuffling to Spotify. It shuffles all of your music based on randomness and ensures sufficient sparseness so you finally get to hear songs from all over your playlist.

## How to use?
- Go to https://f4nu.github.io/spotify-true-shuffle/
- Enter your Spotify App Client ID (see setup below)
- Connect your Spotify Account
- Choose your desired playlist
- Hit **Shuffle** to generate a randomized order
- Optionally hit **Save Results** to export the shuffled playlist to your Spotify library

## Setting up your Spotify App

Because Spotify restricts API access to apps in development mode, each user needs to provide their own Client ID. Here's how to create one:

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard/) and log in with your Spotify account (**Premium account required**)
2. Click **Create app**
3. Fill in any name and description you like
4. Under **Redirect URIs**, add: `https://f4nu.github.io/spotify-true-shuffle/`
5. Accept the terms and click **Save**
6. Open the app you just created and click **Settings** — your **Client ID** is shown at the top
7. Paste it into the app when prompted

The Client ID is saved in your browser's local storage. Use the **Forget App ID** link on the connect screen to remove it.

## Differences from the [original repo](https://github.com/kartikk221/spotify-true-shuffle)

| | Original | This fork |
|---|---|---|
| **Auth flow** | Implicit Grant (`response_type=token`) — deprecated by Spotify | Authorization Code + PKCE (`response_type=code`) — works with current Spotify API |
| **Client ID** | Hardcoded | User-provided, stored in localStorage |
| **Shuffle output** | Capped at 100 tracks | Full playlist, all tracks |
| **Playback** | Shuffles and immediately starts playback on a Spotify device | Shuffle only — displays results and lets you save to a new playlist |
| **Save to playlist** | Capped at 100 tracks per API call (broken for large playlists) | Chunked into 100-track requests (PUT + POST) to handle any playlist size |
| **Alt-shuffle** | Avoids back-to-back tracks added by the same person | Same, preserved from upstream |

## License
[MIT](./LICENSE)
