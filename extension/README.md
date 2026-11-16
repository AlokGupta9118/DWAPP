# DigiCalm Shield — Chrome Extension Companion

DigiCalm Shield provides **real, network-level website blocking in Google Chrome** during timed focus blocks. It works alongside the DigiCalm web app to protect students from impulsive social media and feed opening.

---

## 🚀 How to Install in Google Chrome (Under 1 Minute)

1. Open Google Chrome and go to `chrome://extensions`.
2. Toggle on **Developer mode** in the top right corner.
3. Click the **Load unpacked** button in the top left.
4. Browse to and select this `extension` folder (`DWAPP-main/extension`).
5. Click the puzzle icon in Chrome's top right toolbar and **Pin DigiCalm Shield**.

---

## ⚡ How to Connect with the DigiCalm Web App

1. In the DigiCalm web application, click the **Focus Shield** tab.
2. Select or customize the websites you want to block (e.g. `instagram.com`, `youtube.com`, `reddit.com`, `x.com`, `tiktok.com`).
3. Click **Export Focus Shield Config** to download `digicalm-shield-config.json` (or use the clipboard copy option).
4. Click the **DigiCalm Shield** extension icon in your Chrome toolbar.
5. Click **Import Config** and select your downloaded JSON file.
6. Choose your session duration (**25m**, **45m**, **60m**, **90m**, or custom minutes) and click **Start Blocking**!

---

## 🛡️ Key Features

- **Actual Network-Level Interception:** Uses Chrome Manifest V3 `declarativeNetRequest` dynamic rules to intercept and redirect navigation attempts before pages can render.
- **Dedicated DigiCalm Blocked Page:** When visiting a blocked domain, users are redirected to a calm, branded boundary (`blocked.html`) with:
  - Live session countdown timer
  - Their current active study task
  - Resisted urges counter
  - 10-Second Mindful Breathing Reset to break the dopamine habit loop
- **Automatic Expiry & Unblocking:** When the timer ends, websites are automatically unblocked and a desktop chime/notification is delivered.
- **Supportive Emergency Unlock:** A 5-second cognitive speedbump allows immediate unlock if access is genuinely needed, preventing impulsive breaking while avoiding coercive lockouts.
- **Direct Popup Management:** Add or remove domains directly inside the popup with 1-click toggles for top distraction sites.
- **Toolbar Icon Badge:** Shows live minutes remaining or deflected urge count directly on the extension icon.

---

## 🔬 Academic Justification for Digital Wellness & Study Research

- **Problem Addressed:** Survey research shows students open distracting feeds out of unconscious muscle memory. Traditional screen-time trackers only report damage after hours have been wasted.
- **Intervention:** DigiCalm Shield replaces post-hoc guilt with proactive commitment, creating cognitive friction at the exact moment of habitual impulse.
- **Attention Preservation:** Based on Dr. Gloria Mark's research (UC Irvine), recovering deep attention after an interruption takes ~23 minutes. Deflecting 4 urges preserves over 1.5 hours of mental flow.
- **Privacy First:** All data is kept local within Chrome storage. No tracking servers, no telemetry.
