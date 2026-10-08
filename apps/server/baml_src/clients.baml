// Literal placeholders only. The kernel's BAML engine replaces the client on
// every call with a one-leaf ClientRegistry built from the resolved Pi route,
// so nothing here reads the environment and no call reaches this endpoint.

retry_policy KernelCallRetry {
  max_retries 1
  strategy {
    type exponential_backoff
    delay_ms 500
  }
}

client<llm> KernelDefault {
  provider "openai-responses"
  retry_policy KernelCallRetry
  options {
    base_url "http://unconfigured.invalid/v1"
    api_key "unused"
    model "unconfigured"
  }
}
