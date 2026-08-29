import { Fragment, useEffect, useMemo, useState } from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend,
} from "recharts";

const RANGE_OPTIONS = ["1M", "3M", "6M", "YTD", "1A", "MAX"];
const METRIC_OPTIONS = ["TOTAL", "INVESTMENTS", "PNL"];
const PERFORMANCE_TABS = ["CALENDAR", "VINTAGE"];
const MONTH_NAMES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function apiFetch(path, options = {}) {
    if (!API_BASE_URL) {
        throw new Error("Falta configurar VITE_API_BASE_URL");
    }

    const token = window.localStorage.getItem("portfolio-auth-token");

    return fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            ...(options.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
}

export default function HistoryView() {
    return null;
}
