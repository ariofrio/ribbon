# Duplicate delivery

Retrying a temporary server failure is safe: the receiver deduplicates accepted events by event ID, so retries cannot duplicate a committed write.
