# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js backend API for "Vamo" - a ride-sharing and delivery service application. The system supports both taxi/rideshare services and package delivery with separate driver/delivery person management.

## Development Commands

- **Start server**: `node index.js` (runs on port 5001 by default)
- **Install dependencies**: `npm install`
- **Database setup**: Execute `db/schema.sql` in PostgreSQL to create tables

## Architecture & Database Design

### Core Services
- **Ride-sharing**: Client-Chauffeur (driver) matching with course (trip) management
- **Delivery**: Client-Livreur (delivery person) matching with package delivery
- **Authentication**: OTP-based phone verification using Numverify API and Twilio
- **Payment**: Support for Wave, Orange Money, and cash payments

### Database Schema (PostgreSQL)
The application uses a comprehensive schema with separate entities for:
- **Ride-sharing tables**: Client, Chauffeur, Vehicule, Course, PositionChauffeur
- **Delivery tables**: Livreur, Livraison, TypeLivraison, PositionLivreur
- **Shared features**: Note/NoteLivraison for ratings, Payment systems, Historical data

### API Structure
- **Routes organized by service**:
  - `/api/client` - Client management
  - `/api/livreur` - Delivery person operations
  - `/api/livraison` - Package delivery management
  - `/api/send-otp` & `/api/verify-otp` - Phone verification
- **Database connection**: Centralized PostgreSQL pool in `db/index.js`

### External Dependencies
- **Phone verification**: Numverify API for mobile number validation
- **SMS/OTP**: Twilio integration for sending verification codes
- **Database**: PostgreSQL with connection pooling

### Environment Variables Required
- Database: `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`
- APIs: `NUMVERIFY_API_KEY`, Twilio credentials
- Server: `PORT` (defaults to 5001)

## Key Implementation Details

- OTP codes expire after 5 minutes and are stored in database
- Phone numbers must be mobile type (validated via Numverify)
- Separate position tracking tables for real-time location updates
- Historical data preservation through dedicated archive tables
- Course/delivery states: 'en_attente', and other status values
- Rating system (1-5) for both rides and deliveries