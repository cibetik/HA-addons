const express = require("express");
const os = require("os");
const path = require("path");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args)); // explained here https://www.npmjs.com/package/node-fetch
const app = express();
const port = 8001;

const apiUrl = "https://api.golemio.cz/v2";
const apiToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Mjc1NiwiaWF0IjoxNzE1ODYzMTQ2LCJleHAiOjExNzE1ODYzMTQ2LCJpc3MiOiJnb2xlbWlvIiwianRpIjoiMjUxZjgzNmQtNmYyMy00MjM3LTg4N2EtODlmZWQ3N2EwMmRmIn0.UW4o1jLxWRmb16MtwlZgFywFTA_PN2X1kKQbDNLSpkY";
const homeStopIDs = ["U310Z2P", "U310Z2", "U3240Z3P"]; // Kutnohorská ("U310Z2P", "U310Z2"), Kardausova
const depoStopIDs = ["U1071Z4", "U1071Z4P"]; // Depo Hostivař bus platform
const metroStopIDs = ["U1071Z101P", "U1071Z102P"];
const minutesBefore = 2;
const minutesAfter = 60;
const transferTime = 3; // minutes
const includeMetroTrains = false;
const airCondition = false;
const preferredTimezone = "Europe_Prague";
const mode = "departures";
const order = "real";
const filter = "none"; // routeOnce or none
const skip = "canceled";
const limit = 8;

const excludedFromDepo = [];
const excludedToDepo = ["204"];
var metroDepartures = [];

// Set the view engine to ejs
app.set("view engine", "ejs");

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
};

try {
  //'172.30.33.2'
  app.listen(port, () => {
    const IP = getLocalIP();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentTime = new Date();

    console.log(`Server running at http://${IP}:${port}/ at time zone ${timezone}. Local time is: ${currentTime}`);
  });
} catch (error) {
  console.log(error);
  console.log("Restarting");

  app.listen(port, () => {
    const IP = getLocalIP();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentTime = new Date();

    console.log(`Server running at http://${IP}:${port}/ at time zone ${timezone}. Local time is: ${currentTime}`);
  });
}

// Endpoints
app.get("/", async (req, res) => {
  try {
    const data = await fetchDepartureDataFromHome();

    const departures = data.departures
      .filter((departure) => !excludedToDepo.includes(departure.route.short_name))
      .map((departure) => ({
        routeShortName: departure.route.short_name,
        departureTime: new Date(departure.departure_timestamp.predicted).toLocaleTimeString(),
        lastStopName: departure.last_stop ? departure.last_stop.name : null,
      }));

    res.render("index", { departures: departures }); // Initial render with departures from home
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch departure data" });
  }
});

app.get("/home", async (req, res) => {
  try {
    const data = await fetchDepartureDataFromHome();
    fetchAndStoreDepartureDataFromMetro();

    // Fetch trip data for each departure in parallel
    const tripDataArray = await Promise.all(
      data
      .departures.filter(
        (departure) => !excludedToDepo.includes(departure.route.short_name)
      )
      .map(async (departure) => {
        const arivalToLastStop = await arrivalToLastStop(departure.trip.id);

        // Add delay (in seconds) to arivalToLastStop
        let arrivalToLastStopWithDelay = null;
        if (arivalToLastStop) {
          // arivalToLastStop is in "HH:mm:ss" format
          const [h, m, s] = arivalToLastStop.split(":").map(Number);
          const date = new Date();
          date.setHours(h, m, s, 0);
          // Add delay in seconds
          date.setSeconds(date.getSeconds() + (departure.delay?.seconds || 0));
          // Format back to "HH:mm:ss"
          arrivalToLastStopWithDelay = date.toTimeString().slice(0, 8);
        }

        let metroDepartureTime = null;
        const nextMetro = await firstMetroDepartureAfter(arrivalToLastStopWithDelay, transferTime);
        if (nextMetro) {
          // Format to "HH:mm:ss" in user's (server's) local time zone
          const metroDate = new Date(nextMetro);
          metroDepartureTime = metroDate.toTimeString().slice(0, 8);
        } else {
          metroDepartureTime = null;
        }

        return {
          routeShortName: departure.route.short_name,
          departureTime: new Date(departure.departure_timestamp.predicted),
          lastStopName: departure.last_stop ? departure.last_stop.name : null,
          delay: departure.delay.seconds,
          trip_id: departure.trip.id,
          realArrivalToLastStop: arrivalToLastStopWithDelay, // Attach the arrival time with delay
          metroDeparture: metroDepartureTime,
        };
      })
    );

    res.send({ departures: tripDataArray });
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch departure data" });
  }
});

app.get("/depo", async (req, res) => {
  try {
    const data = await fetchDepartureDataFromDepo();

    const departures = data.departures
      .filter((departure) => !excludedFromDepo.includes(departure.route.short_name))
      .map((departure) => ({
        routeShortName: departure.route.short_name,
        departureTime: new Date(departure.departure_timestamp.predicted),
        lastStopName: departure.last_stop ? departure.last_stop.name : null,
        delay: departure.delay.seconds,
        trip_id: departure.trip.id,
      }));

    res.send({ departures });
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch departure data" });
  }
});

app.get("/metro", async (req, res) => {
  try {
    const departures = await fetchAndStoreDepartureDataFromMetro();
    res.send({ departures });
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch departure data" });
  }
});

app.get("/map", async (req, res) => {
  const tripId = req.query.trip_id;
  if (!tripId) {
    return res.status(400).send("trip_id query parameter is required");
  }

  try {
    const routeData = await fetchRouteData(tripId);
    const stops = routeData.stops || []; // Default to empty array if stops is null or undefined
    const livePosition = await fetchLivePosition(tripId); // Fetch live position data

    res.render("map", {
      route: routeData.shape,
      stops: stops,
      livePosition: livePosition || null, // Pass live position, default to null if not available
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to fetch route or live position data");
  }
});

// MAIN CODE
// Helper to detect if we are in CEST (Central European Summer Time)
function getPragueOffsetMinutes() {
  const now = new Date();
  // getTimezoneOffset returns the offset in minutes from UTC (negative for east of UTC)
  // CEST is UTC+2 (offset -120), CET is UTC+1 (offset -60)
  const offset = -now.getTimezoneOffset();
  if (offset === 120) {
    return 120; // CEST
  } else {
    return 60; // CET
  }
}

function getCurrentIsoDateTime(offsetMinutes) {
  const now = new Date();
  const isoDateTime = new Date(now.getTime() + offsetMinutes * 60000);
  return isoDateTime.toISOString().slice(0, -5);
}

async function fetchDepartureDataFromHome() {
  return fetchDepartureData(true);
}

async function fetchDepartureDataFromDepo() {
  return fetchDepartureData(false);
}

async function fetchDepartureData(fromHome) {
  let stopIDs = fromHome ? homeStopIDs : depoStopIDs;
  const timeFrom = getCurrentIsoDateTime(getPragueOffsetMinutes());
  const url = `${apiUrl}/pid/departureboards?ids[]=${stopIDs.join("&ids[]=")}&minutesBefore=${minutesBefore}&minutesAfter=${minutesAfter}&timeFrom=${timeFrom}&includeMetroTrains=${includeMetroTrains}&airCondition=${airCondition}&preferredTimezone=${preferredTimezone}&mode=${mode}&order=${order}&filter=${filter}&skip=${skip}&limit=${limit}`;

  try {
    console.log("Fetching departures data");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Access-Token": apiToken,
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching departure data:", error);
  }
}

async function fetchDepartureDataFromMetro() {
  const timeFrom = getCurrentIsoDateTime(getPragueOffsetMinutes());
  const url = `${apiUrl}/pid/departureboards?ids[]=${metroStopIDs.join("&ids[]=")}&minutesBefore=${0}&minutesAfter=${minutesAfter}&timeFrom=${timeFrom}&includeMetroTrains=${true}&airCondition=${airCondition}&preferredTimezone=${preferredTimezone}&mode=${mode}&order=${order}&filter=${filter}&skip=${skip}&limit=${limit}`;

  try {
    console.log("Fetching metro departures data");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Access-Token": apiToken,
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching departure data:", error);
  }
}

async function fetchAndStoreDepartureDataFromMetro() {
  const data = await fetchDepartureDataFromMetro();

  const departures = data.departures
    .filter((departure) => !excludedFromDepo.includes(departure.route.short_name))
    .map((departure) => ({
      routeShortName: departure.route.short_name,
      departureTime: new Date(departure.departure_timestamp.predicted),
      lastStopName: departure.last_stop ? departure.last_stop.name : null,
      delay: departure.delay.seconds,
      trip_id: departure.trip.id,
    }));

  metroDepartures = departures; // Store metro departures globally
  return departures;
}

async function firstMetroDepartureAfter(timeString, offsetMinutes = 0) {
  // Add offsetMinutes to timeString
  const [h, m, s] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(h, m, s, 0);
  date.setMinutes(date.getMinutes() + offsetMinutes);
  const formattedTimeString = date.toTimeString().slice(0, 8);

  const departuresAfter = metroDepartures.filter((departure) => {
    // Extract "HH:mm:ss" from ISO string
    const depTime = new Date(departure.departureTime).toTimeString().slice(0, 8);
    return depTime > formattedTimeString;
  });

  return departuresAfter.length > 0 ? departuresAfter[0].departureTime : null;
}

async function fetchTripData(tripId) {
  const url = `${apiUrl}/public/gtfs/trips/${tripId}?scopes=stop_times`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json; charset=utf-8",
        "X-Access-Token": apiToken,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Error fetching trip data:", error);
    return null;
  }
}

async function arrivalToLastStop(tripId) {
  const tripData = await fetchTripData(tripId);
  if (!tripData) return null;

  // Get the last stop
  const lastStop = tripData.stop_times.features[tripData.stop_times.features.length - 1];

  // Return the arrival_time property (as string, e.g. "05:31:00")
  return lastStop.properties.arrival_time;
}

async function fetchRouteData(tripId) {
  console.log(`Fetching routes data for ${tripId}`);

  const response = await fetch("https://mapa.pid.cz/getShape.php", {
    method: "post",
    body: JSON.stringify({ id: tripId }),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
      "Content-Type": "application/json",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      host: "mapa.pid.cz",
    },
  });

  if (!response.ok) {
    console.log(`Fetching routes data: HTTP error (Status: ${response.status})`);
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = await response.json();
  return data;
}

async function fetchLivePosition(tripId) {
  const url = `${apiUrl}/vehiclepositions/${tripId}?includeNotTracking=false&includePositions=false&preferredTimezone=Europe_Prague`;

  try {
    console.log(`Fetching live position for ${tripId}`);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Access-Token": apiToken,
      },
    });

    const data = await response.json();
    return data.geometry.coordinates;
  } catch (error) {
    console.error("Error fetching live position data:", error);
  }
}
