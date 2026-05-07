# TrueShuffle: An open-source music shuffling web application for Spotify
![alt text](/assets/images/meta-image.png)

## Motivation
After having Spotify play the same 40-50 songs repetitively from a playlist well over 1000 songs, I was done with their shuffle algorithm. TrueShuffle is a completely front-end based web application that interacts with the Spotify API to bring truly unbiased music shuffling to Spotify. It shuffles all of your music based on randomness and ensures sufficient sparseness so you finally get to hear songs from all over your playlist.

## How to use?
- Go to https://f4nu.github.io/spotify-true-shuffle/
- Connect your Spotify Account
- Choose your desired playlist
- Hit **Shuffle** to generate a randomized order
- Optionally hit **Save Results** to export the shuffled playlist to your Spotify library

## Differences from the [original repo](https://github.com/kartikk221/spotify-true-shuffle)

| | Original | This fork |
|---|---|---|
| **Auth flow** | Implicit Grant (`response_type=token`) — deprecated by Spotify | Authorization Code + PKCE (`response_type=code`) — works with current Spotify API |
| **Shuffle output** | Capped at 100 tracks | Full playlist, all tracks |
| **Playback** | Shuffles and immediately starts playback on a Spotify device | Shuffle only — displays results and lets you save to a new playlist |
| **Save to playlist** | Capped at 100 tracks per API call (broken for large playlists) | Chunked into 100-track requests (PUT + POST) to handle any playlist size |
| **Alt-shuffle** | Avoids back-to-back tracks added by the same person | Same, preserved from upstream |

## License
[MIT](./LICENSE)
