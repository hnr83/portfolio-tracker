import React from "react";

export default function PinIcon({ active = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-4 w-4 transition-transform duration-200 ${active ? "-rotate-12" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 3.5c1.8 0 3.2 1.4 3.2 3.2 0 .8-.3 1.6-.8 2.2l-1.2 1.3v3.1l1.4 1.4c.3.3.1.8-.3.8h-3.6l-1.8 5.2c-.1.4-.7.4-.8 0l-1.8-5.2H5.5c-.5 0-.7-.5-.3-.8l1.4-1.4v-3.1L5.4 8.9a3.19 3.19 0 0 1 4.6-4.4L11 5.4h2.1l1-1c.4-.6.9-.9 1.4-.9Z" />
    </svg>
  );
}