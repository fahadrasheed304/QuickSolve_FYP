"use client"

import { toast } from "react-toastify"

const DEFAULT_ERROR_MESSAGE =
  "Something went wrong. Please try again in a moment."

const NETWORK_ERROR_MESSAGE =
  "We could not reach the server. Please check your internet connection and try again."

const SERVER_ERROR_MESSAGE =
  "We are having trouble processing this right now. Please try again shortly."

export function getFriendlyMessage(
  message: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
) {
  if (typeof message !== "string" || !message.trim()) {
    return fallback
  }

  const cleanMessage = message.trim()
  const lowerMessage = cleanMessage.toLowerCase()

  if (
    lowerMessage.includes("failed to fetch") ||
    lowerMessage.includes("fetch failed") ||
    lowerMessage.includes("network error") ||
    lowerMessage.includes("load failed")
  ) {
    return NETWORK_ERROR_MESSAGE
  }

  if (
    lowerMessage.includes("internal server error") ||
    lowerMessage.includes("unexpected error") ||
    lowerMessage === "failed"
  ) {
    return SERVER_ERROR_MESSAGE
  }

  return cleanMessage
}

export function getApiMessage(
  data: { message?: unknown; error?: unknown } | null | undefined,
  fallback?: string,
) {
  return getFriendlyMessage(data?.message || data?.error, fallback)
}

export function notifyError(message: unknown, fallback?: string) {
  toast.error(getFriendlyMessage(message, fallback))
}

export function notifySuccess(message: unknown, fallback = "Done successfully.") {
  toast.success(getFriendlyMessage(message, fallback))
}

export function notifyWarning(message: unknown, fallback = "Please review this before continuing.") {
  toast.warning(getFriendlyMessage(message, fallback))
}
