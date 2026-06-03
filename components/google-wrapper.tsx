"use client"
import React from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'

export default function GoogleWrapper({ children }: { children: React.ReactNode }) {
  // Use the Client ID provided by the user
  const clientId = "70284826535-c3pdmrq2hrsr6ufbrfkk793io0nh2j95.apps.googleusercontent.com"
  
  return (
    <GoogleOAuthProvider clientId={clientId}>
      {children}
    </GoogleOAuthProvider>
  )
}
