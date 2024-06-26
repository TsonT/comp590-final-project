import dayjs from "dayjs";
// @ts-ignore
import kebabCase from "lodash.kebabcase";
import sodium from "libsodium-wrappers";
import * as CryptoJS from "crypto-js";

export const formatFileName = (name: string) => {
  const splitted = name.split(".");

  const extension = splitted.slice(-1)[0];
  const baseName = splitted.slice(0, -1).join(".");

  return `${Date.now()}-${kebabCase(
    baseName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
  )}.${extension}`;
};

export const formatFileSize = (size: number) => {
  let i = Math.floor(Math.log(size) / Math.log(1024));

  return `${(size / Math.pow(1024, i)).toFixed(1)} ${
    ["B", "KB", "MB", "GB", "TB"][i]
  }`;
};

export const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const formatter = dayjs(date);
  const now = new Date();

  if (dayjs().isSame(formatter, "date")) return formatter.format("h:mm A");

  if (dayjs().isSame(formatter, "week")) return formatter.format("ddd h:mm A");

  if (now.getFullYear() === date.getFullYear())
    return formatter.format("MMM DD h:mm A");

  return formatter.format("DD MMM YYYY h:mm A");
};

export const splitLinkFromMessage = (message: string) => {
  const URL_REGEX =
    /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()!@:%_\+.~#?&\/\/=]*)/gm;

  const result = message.split(" ").reduce((acc, item) => {
    const isURL = URL_REGEX.test(item);
    if (isURL) acc.push({ link: item });
    else {
      if (typeof acc.slice(-1)[0] === "string") {
        acc = [...acc.slice(0, -1), `${acc.slice(-1)[0]} ${item}`];
      } else {
        acc.push(item);
      }
    }

    return acc;
  }, [] as ({ link: string } | string)[]);

  return result;
};

export function encodeUint8ArrayPropsToBase64(obj: any) {
  const encodedObj = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value instanceof Uint8Array) {
        encodedObj[key] = encodeUint8ArrayToBase64(value);
      } else if (
        Array.isArray(value) &&
        value.every((item) => item instanceof Uint8Array)
      ) {
        encodedObj[key] = value.map(encodeUint8ArrayToBase64);
      } else {
        encodedObj[key] = value;
      }
    }
  }
  return encodedObj;
}

function encodeUint8ArrayToBase64(uint8Array) {
  return window.btoa(String.fromCharCode.apply(null, uint8Array));
}

export function decodeBase64PropsToUint8Array(obj: any) {
  const decodedObj = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === "string") {
        decodedObj[key] = decodeBase64ToUint8Array(value);
      } else if (
        Array.isArray(value) &&
        value.every((item) => typeof item === "string")
      ) {
        decodedObj[key] = value.map(decodeBase64ToUint8Array);
      } else {
        decodedObj[key] = value;
      }
    }
  }
  return decodedObj;
}

export function decodeBase64ToUint8Array(base64String) {
  const binaryString = window.atob(base64String);
  const uint8Array = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  return uint8Array;
}

function kdf(input: any, keyLength: any) {
  return CryptoJS.PBKDF2(CryptoJS.lib.WordArray.create(input), "TarChat", {
    keySize: keyLength * 4,
    iterations: 10,
  }).toString(CryptoJS.enc.Base64);
}

export function generateSK(
  senderBundle: any,
  listenerBundle: any,
  ephemeralKey: any
) {
  const DH1 = sodium.crypto_scalarmult(
    senderBundle.identityKey,
    listenerBundle.signedPrekey
  );
  const DH2 = sodium.crypto_scalarmult(
    ephemeralKey,
    listenerBundle.identityKey
  );
  const DH3 = sodium.crypto_scalarmult(
    ephemeralKey,
    listenerBundle.signedPrekey
  );

  var DH4 = "";

  if (listenerBundle.oneTimePrekeys.size != 0) {
    DH4 = sodium.crypto_scalarmult(
      ephemeralKey,
      listenerBundle.oneTimePrekeys[0]
    );
  }

  const concatenatedDH = new Uint8Array([...DH1, ...DH2, ...DH3, ...DH4]);

  const SK = kdf(concatenatedDH, 32);

  return SK;
}

export function getItemFromLocalStorage(name: string) {
  try {
    const keysJSON = localStorage.getItem(name);
    return keysJSON ? JSON.parse(keysJSON) : null;
  } catch (error) {
    console.error("Error retrieving" + name + "from local storage:", error);
    return null;
  }
}

export function storeItemLocally(name: string, item: any) {
  try {
    localStorage.setItem(name, JSON.stringify(item));
  } catch (error) {
    console.error("Error saving" + name + "to local storage:", error);
  }
}
