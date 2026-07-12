export default {
  server: {
    host: "127.0.0.1",
    proxy: {
      "/feed": {
        target: 'https://data.bff.fm',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/feed/, ''),
      }
    }
  }
}
