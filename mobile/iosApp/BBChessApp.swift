import SwiftUI
import Bbchess

@main
struct BBChessApp: App {
    var body: some Scene {
        WindowGroup {
            KotlinScreen().ignoresSafeArea()
        }
    }
}

private struct KotlinScreen: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        IosAppKt.MainViewController()
    }

    func updateUIViewController(_ controller: UIViewController, context: Context) {}
}
