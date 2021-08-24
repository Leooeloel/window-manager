import { AnimationMode, Camera, Size } from "white-web-sdk";
import { AppManager } from "./index";
import { isEqual } from "lodash-es";

export class MainViewProxy {
    constructor(
        private manager: AppManager
    ) {}

    public get view() {
        return this.manager.viewManager.mainView;
    }

    public moveCameraToContian(size: Size) {
        this.view.moveCameraToContain({
            width: size.width,
            height: size.height,
            originX: -size.width / 2,
            originY: -size.height / 2,
            animationMode: AnimationMode.Immediately
        });
    }

    public moveCamera(camera: Camera) {
        if (camera && !isEqual(camera, this.view.camera)) {
            this.view.moveCamera({
                centerX: camera.centerX,
                centerY: camera.centerY,
                scale: camera.scale * this.view.camera.scale,
                animationMode: AnimationMode.Immediately
            });
        }
    }
}
