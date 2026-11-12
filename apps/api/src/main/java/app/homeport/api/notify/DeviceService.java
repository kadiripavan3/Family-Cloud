package app.homeport.api.notify;

import app.homeport.api.common.ApiProblem;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The phones a person gets pushes on: which ones count, and how many. */
@Service
public class DeviceService {

    /** How the push service writes a phone's address: {@code ExponentPushToken[…]} (or the newer {@code ExpoPushToken[…]}). */
    private static final Pattern PUSH_ADDRESS = Pattern.compile("Expo(nent)?PushToken\\[[^\\[\\]\\s]{1,200}]");

    /** Nobody has more phones than this. The newest ones are kept. */
    static final int PHONES_EACH = 10;

    private final DeviceStore devices;

    DeviceService(DeviceStore devices) {
        this.devices = devices;
    }

    /**
     * Remembers a phone for a person. Only an address the push service could have given is taken: anything
     * else would be sent along with other people's pushes and could get the whole batch refused.
     */
    @Transactional
    public void register(UUID userId, String token, DevicePlatform platform, String timeZone) {
        String address = token.trim();
        if (!PUSH_ADDRESS.matcher(address).matches()) {
            throw ApiProblem.badRequest("invalid_device", "That isn't a push address this app can use.");
        }
        devices.register(userId, address, platform, zone(timeZone));
        devices.keepNewest(userId, PHONES_EACH);
    }

    public void forget(UUID userId, String token) {
        devices.forget(userId, token.trim());
    }

    /** A time zone the API knows, or UTC. A wrong one must never stop a device from registering. */
    private static String zone(String timeZone) {
        if (timeZone == null || timeZone.isBlank()) {
            return "UTC";
        }
        try {
            return ZoneId.of(timeZone.trim()).getId();
        } catch (DateTimeException unknown) {
            return "UTC";
        }
    }
}
