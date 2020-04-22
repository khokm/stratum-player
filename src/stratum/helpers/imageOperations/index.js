import { PNG } from "pngjs";
import { StratumError } from "~/helpers/errors";
import { bytesToBase64 } from "./base64";
import { decode } from "./bmpDecoder";

function applyAlphaMask(imageBytes, maskBytes) {
    const { width, height, data: imageData } = decode(imageBytes);
    const { data: maskData } = decode(maskBytes);
    for (let i = 3; i < imageData.length && i < maskData.length; i += 4) {
        imageData[i] = 255 - maskData[i - 1];
    }
    const png = new PNG({ width: width, height: height, inputHasAlpha: true, filterType: 4 });
    png.data = imageData;
    return { data: PNG.sync.write(png), width, height };
}

function readBitmapSize(stream) {
    const _pos = stream.position;
    if (stream.readWord() !== 0x4d42) throw new StratumError("BMP файл поврежден");
    const size = stream.readLong();
    stream.seek(_pos);
    return size;
}

export function readBitmap(stream) {
    const bmpBytes = stream.readBytes(readBitmapSize(stream));

    const { width, height } = decode(bmpBytes);
    const image = "data:image/bmp;base64," + bytesToBase64(bmpBytes);
    return { image, width, height };
}

export function readDoubleBitmap(stream) {
    const bmpBytes = stream.readBytes(readBitmapSize(stream));
    const maskBytes = stream.readBytes(readBitmapSize(stream));

    const { data, width, height } = applyAlphaMask(bmpBytes, maskBytes);
    const image = "data:image/png;base64," + bytesToBase64(data);
    return { image, width, height };
}
