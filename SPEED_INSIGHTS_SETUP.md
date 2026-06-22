# Vercel Speed Insights Setup

This document outlines the steps to enable Vercel Speed Insights for this FastAPI application.

## Overview

Vercel Speed Insights has been integrated into this project following the official Vercel documentation. The integration uses the vanilla JavaScript approach, which is suitable for static HTML/JavaScript frontends.

## What Was Implemented

### 1. Script Integration

A Speed Insights script tag has been added to `static/index.html`:

```html
<!-- Vercel Speed Insights -->
<script defer src="/_vercel/speed-insights/script.js"></script>
```

This script is loaded with the `defer` attribute to ensure it doesn't block page rendering.

## Required Setup Steps

### 1. Enable Speed Insights on Vercel Dashboard

**IMPORTANT:** Before the Speed Insights script will work, you must enable it in your Vercel dashboard:

1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `online-ordering-system`
3. Navigate to **Speed Insights** from the sidebar
4. Click the **Enable** button

This will create the necessary routes at `/_vercel/speed-insights/*` after your next deployment.

### 2. Deploy Your Application

After enabling Speed Insights, deploy your application to Vercel:

```bash
# Using Vercel CLI
vercel deploy

# Or connect your Git repository for automatic deployments
# Push to your main branch and Vercel will auto-deploy
```

### 3. Verify Installation

After deployment and some user traffic:

1. Return to the Speed Insights tab in your Vercel dashboard
2. Metrics will appear within a few days of user activity
3. You'll see Core Web Vitals metrics:
   - **LCP** (Largest Contentful Paint)
   - **FID** (First Input Delay)
   - **CLS** (Cumulative Layout Shift)
   - **TTFB** (Time to First Byte)
   - **FCP** (First Contentful Paint)

## How It Works

1. **Client-Side Tracking:** The script automatically measures Web Vitals performance metrics
2. **Data Collection:** Metrics are collected from real user interactions
3. **Reporting:** Data is sent to Vercel's analytics endpoint at `https://vitals.vercel-analytics.com/v1/vitals`
4. **Dashboard:** View aggregated performance data in your Vercel dashboard

## Technical Details

### Framework
- **Backend:** FastAPI (Python)
- **Frontend:** Vanilla HTML/JavaScript with static file serving
- **Integration Method:** Script tag (vanilla JavaScript approach)

### Performance Impact
- The script is loaded with `defer` attribute
- Minimal performance overhead (< 1KB gzipped)
- Does not block page rendering or user interactions

## Troubleshooting

### Script 404 Error
If you see a 404 error for `/_vercel/speed-insights/script.js`:
- Ensure Speed Insights is enabled in your Vercel dashboard
- Verify you've deployed after enabling the feature
- Check that you're accessing the application through your Vercel deployment URL

### No Data Appearing
If metrics don't appear in the dashboard:
- Wait at least 24-48 hours after deployment
- Ensure you have real user traffic visiting your site
- Verify the script is loading correctly in browser DevTools (Network tab)

## Additional Resources

- [Vercel Speed Insights Documentation](https://vercel.com/docs/speed-insights)
- [Vercel Speed Insights Quickstart](https://vercel.com/docs/speed-insights/quickstart)
- [Web Vitals Documentation](https://web.dev/vitals/)

## Notes

- This integration works automatically once enabled on Vercel
- No backend changes are required for FastAPI
- The script only works on Vercel-deployed applications
- Local development will show a 404 for the script (this is expected)
