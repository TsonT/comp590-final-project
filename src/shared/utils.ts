import dayjs from "dayjs";
// @ts-ignore
import kebabCase from "lodash.kebabcase";

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

function decodeBase64ToUint8Array(base64String) {
  const binaryString = window.atob(base64String);
  const uint8Array = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  return uint8Array;
}
