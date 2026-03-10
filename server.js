import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import compression from "compression";

dotenv.config(); // load vars from env

const app = express();
const API_KEY = process.env.TIMEZONEDB_KEY;
const PORT = process.env.PORT || 3000;

const rateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // limit each IP to 20 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
});

// (https://expressjs.com/en/advanced/best-practice-security.html)
app.use(helmet()); // hides or changes headers to reduce vulnerability attacks
app.use(compression()); // zips the data to be sent for faster data retrieval
app.use(cors()); // use CORS to allow origins globally
// tells Express to trust the proxy's IP header so the rate limiter can see the REAL user's IP
app.set('trust proxy', 1);

app.get("/timezone", rateLimiter, async (req, res) => {
    const latitude = parseFloat(req.query.latitude); // string by default, convert to float
    const longitude = parseFloat(req.query.longitude);

    if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: "Missing latitude or longitude" });
    }
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return res.status(400).json({ error: "Invalid coordinates" });
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: "Coordinates out of range" });
    }

    const controller = new AbortController(); // kill switch for API req
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second limit before timeout

    try {
        const URL = `https://api.timezonedb.com/v2.1/get-time-zone?key=${API_KEY}&format=json&by=position&lat=${latitude}&lng=${longitude}`;
        const response = await fetch(URL, {signal: controller.signal}); // attach controller

        if (!response.ok) {
            throw new Error(`External API status: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
        console.log("SUCCESS GET LOCATION");
    } catch(error) { 
        if (error.name === 'AbortError') {
            console.error("Request timed out");
            res.status(504).json({ error: "External API took too long to respond" });
        } else {
            console.error("Proxy Error:", error.message);
            res.status(500).json({ error: "Internal server error" });
        }
    } finally {
        clearTimeout(timeout); // stop timeout timer
    }
});

app.get("/listtimezones", rateLimiter, async(req, res) => {
    const controller = new AbortController(); // kill switch for API req
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second limit before timeout
    try {
        const URL = `http://api.timezonedb.com/v2.1/list-time-zone?key=${API_KEY}&format=json`
        const response = await fetch(URL, {signal: controller.signal})

        if(!response.ok) {
            throw new Error(`External API status: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
        console.log("SUCCESS GET TIMEZONE LIST");
    } catch(error) {
        if (error.name === 'AbortError') {
            console.error("Request timed out");
            res.status(504).json({ error: "External API took too long to respond" });
        } else {
            console.error("Proxy Error:", error.message);
            res.status(500).json({ error: "Internal server error" });
        }
    } finally {
        clearTimeout(timeout);
    }
});

// if not /timezone, 404
app.use((req, res) => { 
    res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
    console.log(`Server is live in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
