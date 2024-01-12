import express from 'express';
import bodyParser from 'body-parser';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';

// const sdk = SpotifyApi.withUserAuthorization("client-id", "https://localhost:3000", ["scope1", "scope2"]);
// const items = await sdk.search("The Beatles", ["artist"]);
// console.log(items);

const app = express();
const port = process.env.PORT;
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

let sdk;

app.use(express.static('public'));
app.set('view engine', 'ejs');

app.get('/', (_, res) => {
  res.render('index', { port, spotifyClientId });
});

app.post('/accept-user-token', (req, res) => {
  let data = req.body;
  console.log('got user token data', data);
  sdk = SpotifyApi.withAccessToken("client-id", data); // SDK now authenticated as client-side user
});

app.listen(port, () => {
  console.log(`Cred server listening on port ${port}`);
});
