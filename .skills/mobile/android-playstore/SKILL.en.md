---
name: Android Google Play Store Submission Guide
description: A step-by-step guide to Android app registration, signing, and release through the Google Play Console. Read when putting an app on the store for the first time or deploying a new version, and when deciding on signing key generation, AAB builds, release tracks, and handling review rejections. Keywords: gradle, signing, keystore, R8, AAB, bundle, Play Console, minifyEnabled, proguard, versionCode.
rules:
  - "Complete developer registration ($25, one-time) on the Play Console first."
  - "Generate a release signing key (Keystore) and back it up safely — if lost, app updates become permanently impossible."
  - "Build the distribution artifact as an AAB (Android App Bundle), not an APK."
  - "Prepare the store listing and required assets (icon, screenshots)."
  - "Deploy to the internal test track first to verify."
  - "Increase the version code on every upload, and follow Semantic Versioning for the version name."
tags:
  - "gradle"
  - "signing"
  - "keystore"
  - "R8"
  - "AAB"
  - "bundle"
  - "Play Console"
  - "minifyEnabled"
  - "proguard"
  - "versionCode"
---

# 📦 Android Google Play Store Submission Guide

> Summarizes the entire process of registering, signing, and releasing an Android app on the Play Store. Read it step by step when putting an app on the store for the first time or deploying a new version.

## 1. Core Principles

- Complete **developer registration ($25, one-time)** on the Play Console first.
- Generate a release **signing key (Keystore)** and back it up safely — if lost, app updates become permanently impossible.
- Build the distribution artifact as an **AAB (Android App Bundle)**, not an APK.
- Prepare the store listing and **required assets (icon, screenshots)**.
- Deploy to the **internal test track** first to verify.
- Increase the version code on every upload, and follow Semantic Versioning for the version name.

## 2. Rules

### 2-1. Google Play Console Registration ($25, one-time)

1. Visit [play.google.com/console](https://play.google.com/console)
2. Register a developer account → pay the **$25 one-time registration fee**
3. Enter personal information → it takes **up to 48 hours** to activate
4. The developer name = the publisher name shown on the Play Store

### 2-2. Creating an App Signing Key (Keystore)

The app signing key proves the app's identity. **Once generated, it must never be lost.** If lost, you cannot update the same app and must re-register as a new app.

Generate it in Android Studio:
```
Build menu → Generate Signed Bundle/APK
→ select Android App Bundle (AAB recommended)
→ Create new...
```

Input fields:
- **Key store path**: save in a safe location (e.g., `~/keystores/harness.jks`)
- **Password**: set a strong password (you must remember it!)
- **Key alias**: app name (e.g., `harness-key`)
- **Validity**: set 25 years or more (Google requirement)
- **Name/organization/country**: enter

> ⚠️ **Never commit** the Keystore file and password **to Git**. If lost, app updates become permanently impossible. Backing up in a separate safe place is essential.

Signing configuration in `build.gradle`:
```kotlin
// app/build.gradle.kts
android {
    signingConfigs {
        create("release") {
            storeFile = file("../keystores/harness.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD") // manage via env var
            keyAlias = "harness-key"
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
}
```

### 2-3. Generating the AAB Build

The Play Store requires the **AAB (Android App Bundle)** format instead of APK. When you upload an AAB, Google automatically generates optimized APKs suited to each device.

```
Build menu → Generate Signed Bundle/APK
→ select Android App Bundle
→ select Release → Next → Finish
```

Or via the Gradle command:
```bash
./gradlew bundleRelease
# output location: app/build/outputs/bundle/release/app-release.aab
```

### 2-4. Creating the App in the Play Console

1. Play Console → **All apps** → **Create app**
2. Input fields:
   - **App name**: up to 30 characters
   - **Default language**: Korean
   - **App or game**: select
   - **Paid or free**: select (cannot change from free to paid)
3. Agree to the **Developer Program Policy** and **US export laws**

### 2-5. Writing the Store Listing

Required assets:
| Item | Specification | Required |
|------|------|------|
| App icon | 512 × 512 px, PNG, 1MB or less | Required |
| Feature graphic | 1024 × 500 px | Required |
| Screenshots (phone) | at least 2, 16:9 or 9:16 | Required |
| Screenshots (tablet) | 7-inch and 10-inch each | If tablet is supported |

App description:
- **Short description**: 80 characters or less (shown in search)
- **Full description**: 4000 characters or less
- No mention of competitors and no misleading expressions

Privacy policy URL:
- A URL specifying what data the app collects is required
- It must be an accessible external URL

### 2-6. App Content Settings (required; rejected if missed)

In the Play Console → **App content** section, complete all of the following:

1. **Privacy policy**: enter URL
2. **Ads**: select whether ads are included
3. **App access**: if login is required → provide a test account
4. **Content rating**: complete the questionnaire → rating is automatically determined (PEGI, IARC)
5. **Target audience**: set the age range
6. **News app**: check if applicable
7. **COVID-19 related app**: check if applicable

### 2-7. Selecting a Release Track and Uploading the AAB

Release track types:
| Track | Description | Recommended use |
|------|------|-----------|
| **Internal testing** | Up to 100 team members, instant deploy | Testing during development |
| **Closed testing (alpha)** | Invited users only, Google review required | Beta testers |
| **Open testing (beta)** | Anyone can join | Pre-release verification |
| **Production** | Fully public | Official release |

Upload order:
1. **Production** → **Create new release**
2. Agree to **Play App Signing** (recommended — Google manages the signing key)
3. Upload the AAB file
4. **Version name**: the version visible to users (e.g., `1.0.0`)
5. **Version code**: an internal incrementing number, must be raised on every upload
6. Write release notes (update contents)
7. Click **Save release for review**

### 2-8. Review and Release

- Initial review: takes **1–3 business days**
- Re-review: usually faster (a few hours ~ 1 day)

### 2-9. Managing Version Code & Version Name

```kotlin
// app/build.gradle.kts
android {
    defaultConfig {
        versionCode = 5         // +1 on every upload (internal, not shown to users)
        versionName = "1.2.0"   // version shown to users (Semantic Versioning)
    }
}
```

**Semantic Versioning rules:**
- `1.0.0` → initial release
- `1.0.1` → bug fix
- `1.1.0` → new feature added
- `2.0.0` → major change

## 3. Common Mistakes (frequent rejection reasons)

| Reason | Solution |
|------|--------|
| App crashes | Test thoroughly on a real device before submitting |
| Incomplete store listing | Verify all required items are filled |
| No privacy policy | Register an accessible URL |
| Cannot inspect the app without login | Enter a test account under App access |
| Unclear purpose for dangerous permissions | Add an explanation of why the permission is used |
| Intellectual property infringement (icon, name) | Use a unique brand |

## 4. Checklist

- [ ] Did you complete Play Console developer registration ($25)?
- [ ] Did you generate the Keystore and back it up somewhere safe, not in Git?
- [ ] Did you build the artifact as an AAB, not an APK?
- [ ] Did you prepare the required assets (icon 512×512, feature graphic 1024×500, 2+ screenshots)?
- [ ] Did you complete all app content (privacy policy, content rating, app access, etc.)?
- [ ] Did you verify on the internal test track first?
- [ ] Did you raise versionCode and set versionName with Semantic Versioning?
