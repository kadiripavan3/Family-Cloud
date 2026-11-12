package app.homeport.api.notify;

import app.homeport.api.auth.Me;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/me/devices")
@Tag(name = "Push notifications")
class DeviceController {

    record RegisterDeviceRequest(
            @NotBlank(message = "The device's push address is missing.")
            @Size(max = 300, message = "That push address is too long.")
            @Schema(description = "The device's address at the push service, as Expo gives it")
            String token,

            @NotNull(message = "Say what kind of device this is.")
            DevicePlatform platform,

            @Size(max = 64)
            @Schema(
                    description =
                            "Where the device is, such as Europe/Berlin, so reminders arrive at the right hour. UTC when left out or unknown.")
            String timeZone) {}

    private final DeviceService devices;

    DeviceController(DeviceService devices) {
        this.devices = devices;
    }

    @PutMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "registerDevice",
            summary = "This device may get pushes for the signed-in person. Sending it again just refreshes it.")
    void register(@Me UUID me, @Valid @RequestBody RegisterDeviceRequest request) {
        devices.register(me, request.token(), request.platform(), request.timeZone());
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "forgetDevice", summary = "Stop pushing to this device, for example when signing out")
    void forget(@Me UUID me, @RequestParam String token) {
        devices.forget(me, token);
    }
}
