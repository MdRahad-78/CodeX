[app]
title = CodeX
package.name = codex
package.domain = com.codex
source.dir = .
source.include_exts = py,png,jpg,kv,atlas,html,css,js
version = 1.0.0
requirements = python3,kivy,pyjnius,android
orientation = portrait
fullscreen = 0
android.permissions = INTERNET,READ_EXTERNAL_STORAGE,WRITE_EXTERNAL_STORAGE
android.api = 34
android.minapi = 24
android.sdk = 34
android.ndk = 25b
android.archs = arm64-v8a,armeabi-v7a
android.accept_sdk_license = True
android.add_assets = web:/android_asset

[buildozer]
log_level = 2
warn_on_root = 1
