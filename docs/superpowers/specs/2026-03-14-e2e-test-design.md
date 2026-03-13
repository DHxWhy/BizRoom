---
version: "1.0.0"
created: "2026-03-14 03:20"
updated: "2026-03-14 03:20"
---

# BizRoom.ai E2E Test Design — Hackathon Judge Perspective

## Target
- **Environment**: Production Azure (`gray-pebble-030ae3b10.1.azurestaticapps.net`)
- **Backend**: `bizroom-backend-gqfjg4e6bwdvhyfn.centralus-01.azurewebsites.net`
- **Framework**: Playwright
- **DB**: Azure Cosmos DB (containers: users, rooms, sessions, messages)

## Test Phases

| Phase | Scope                  | Key Assertions                                         |
| ----- | ---------------------- | ------------------------------------------------------ |
| 1     | Lobby → Room Entry     | Name input, brand memory form, room creation           |
| 2     | Meeting Start          | COO opening, 3D scene load, phase transition           |
| 3     | Live Chat              | SSE streaming, message bubbles, typing indicators      |
| 4     | Agent Interaction      | Multi-agent sequence, A2A mention routing              |
| 5     | Mode Switch            | Live→DM→Auto, DM 1:1 isolation                        |
| 6     | Sophia + BigScreen     | Visual hints, BigScreen render, Q/E pagination, blob   |
| 7     | Artifacts              | Excel/PPT generation, download links                   |
| 8     | Performance            | Response latency <5s, streaming FPS, 3D render         |
| 9     | Error Resilience       | Connection drop → REST fallback, timeout recovery      |
| 10    | DB Verification        | Cosmos DB CRUD via API: rooms, sessions, messages, users|

## DB Verification Strategy
Tests call backend REST APIs to verify Cosmos DB writes:
- POST /api/room/create → GET room by joinCode
- POST /api/user/register → GET /api/user/{id}
- POST /api/meeting/start → GET /api/room/{id}/sessions
- POST /api/message → GET /api/session/{id}/messages

## Performance Criteria

| Metric               | Target    |
| -------------------- | --------- |
| Page load (lobby)    | < 3s      |
| Meeting start → COO  | < 10s     |
| First agent response | < 5s      |
| Agent turn complete  | < 15s     |
| Mode switch          | < 1s      |
| BigScreen render     | < 10s     |
| REST fallback        | < 5s      |
