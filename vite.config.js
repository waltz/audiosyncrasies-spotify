export default {
  server: {
    proxy: {
      "/feed": {
        target: 'https://data.bff.fm',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/feed/, ''),
      }
    }
  }
}
