import path from 'node:path'

export default {
  base: '/sample/',
  build: {
    rollupOptions: {
      input: [path.resolve(import.meta.dirname, 'index.html'), path.resolve(import.meta.dirname, 'clean.html')],
    },
  },
}
