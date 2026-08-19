import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { branding } from './config/branding.js'
import './index.css'

document.title = `${branding.appName} — Coffee Shop POS`

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
