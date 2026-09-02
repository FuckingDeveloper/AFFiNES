package app.affine.pro.utils.logger

import timber.log.Timber

class AffineDebugTree : Timber.DebugTree() {

    override fun createStackElementTag(element: StackTraceElement): String {
        return "TrackWork:${super.createStackElementTag(element)}:${element.lineNumber}"
    }
}
