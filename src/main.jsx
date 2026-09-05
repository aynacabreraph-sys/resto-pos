import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { branding } from './config/branding.js'
import './index.css'

document.title = `${branding.appName} — Coffee Shop POS`

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Unhandled application error', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="startup-error" role="alert"><h1>Something went wrong</h1><p>The POS stopped this screen to prevent an unsafe operation.</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Reload application</button></div>;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>,
)
