# Retry exhaustion

The client sends each request at most three times. All unsuccessful HTTP responses are retried.

The final failure is always thrown to the caller.
