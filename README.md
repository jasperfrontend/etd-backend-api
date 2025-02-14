# Escape the Danger - Backend API

## Overview
This document provides an overview of the functions available in the Escape the Danger backend API.

## Table of Contents
1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Game Mechanics](#game-mechanics)
4. [Leaderboard](#leaderboard)

## Authentication
### `POST /api/auth/register`
Registers a new user.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "User registered successfully"
}
```

### `POST /api/auth/login`
Logs in an existing user.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "string"
}
```

## User Management
### `GET /api/users/{id}`
Fetches details of a user by ID.

**Response:**
```json
{
  "id": "string",
  "username": "string",
  "highScore": "number"
}
```

### `PUT /api/users/{id}`
Updates user information.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "User updated successfully"
}
```

## Game Mechanics
### `POST /api/game/start`
Starts a new game session.

**Response:**
```json
{
  "sessionId": "string",
  "startTime": "string"
}
```

### `POST /api/game/end`
Ends the current game session.

**Request Body:**
```json
{
  "sessionId": "string",
  "score": "number"
}
```

**Response:**
```json
{
  "message": "Game session ended",
  "finalScore": "number"
}
```

## Leaderboard
### `GET /api/leaderboard`
Fetches the top scores.

**Response:**
```json
[
  {
    "username": "string",
    "score": "number"
  }
]
```

## Conclusion
This document provides a brief overview of the available API endpoints. For more detailed information, please refer to the API documentation.
