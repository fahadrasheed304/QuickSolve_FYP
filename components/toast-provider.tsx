"use client"

import { ToastContainer } from "react-toastify"

export function ToastProvider() {
  return (
    <ToastContainer
      position="top-right"
      autoClose={4200}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="light"
    />
  )
}
