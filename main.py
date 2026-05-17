from kivy.app import App
from kivy.uix.widget import Widget
from kivy.core.window import Window
from kivy.utils import platform

Window.clearcolor = (0.125, 0.125, 0.125, 1)

class CodeXApp(App):
    def build(self):
        if platform == 'android':
            from android.permissions import request_permissions, Permission
            request_permissions([
                Permission.READ_EXTERNAL_STORAGE,
                Permission.WRITE_EXTERNAL_STORAGE,
            ])

            from jnius import autoclass
            from android.runnable import run_on_ui_thread

            PythonActivity = autoclass('org.kivy.android.PythonActivity')
            WebView = autoclass('android.webkit.WebView')
            WebSettings = autoclass('android.webkit.WebSettings')
            View = autoclass('android.view.View')

            activity = PythonActivity.mActivity

            @run_on_ui_thread
            def create_webview():
                webview = WebView(activity)
                settings = webview.getSettings()
                settings.setJavaScriptEnabled(True)
                settings.setDomStorageEnabled(True)
                settings.setAllowFileAccess(True)
                settings.setCacheMode(WebSettings.LOAD_DEFAULT)
                webview.loadUrl('file:///android_asset/index.html')
                activity.setContentView(webview)

            create_webview()
            return Widget()
        else:
            from kivy.uix.label import Label
            return Label(text='CodeX - Run on Android')

if __name__ == '__main__':
    CodeXApp().run()
