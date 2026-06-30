import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'

export default createVuetify({
  theme: {
    defaultTheme: 'mocha',
    themes: {
      mocha: {
        dark: false,
        colors: {
          primary: '#8C6239', // Warm Mocha
          secondary: '#A67853', // Light Caramel
          background: '#FCFAEE', // Cream
          surface: '#FFFFFF', // Clean White
          accent: '#8C6239', 
          error: '#EF4444',
          info: '#3B82F6',
          success: '#10B981',
          warning: '#F59E0B',
        },
      },
    },
  },
})
