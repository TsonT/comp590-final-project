import { ConversationInfo, MessageItem } from "../../shared/types";
import { FC, Fragment, useEffect, useRef, useState } from "react";
import {
  DocumentData,
  QuerySnapshot,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limitToLast,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";

import AvatarFromId from "./AvatarFromId";
import InfiniteScroll from "react-infinite-scroll-component";
import LeftMessage from "../Message/LeftMessage";
import RightMessage from "../Message/RightMessage";
import Spin from "react-cssfx-loading/src/Spin";
import { db } from "../../shared/firebase";
import { useCollectionQuery } from "../../hooks/useCollectionQuery";
import { useParams } from "react-router-dom";
import { useStore } from "../../store";
import {
  decodeBase64PropsToUint8Array,
  generateSK,
  getItemFromLocalStorage,
  storeItemLocally,
} from "../../shared/utils";
import sodium from "libsodium-wrappers";
import * as CryptoJS from "crypto-js";

interface ChatViewProps {
  conversation: ConversationInfo;
  inputSectionOffset: number;
  replyInfo: any;
  setReplyInfo: (value: any) => void;
}

let ratchetStates = {
  receivedCount: 0,
  DHValues: null,
  DHRoot: null,
  ReceiverRoot: null,
  decryptedMessageIds: new Set(),
  decryptedMessagePlaintexts: [],
};

const ChatView: FC<ChatViewProps> = ({
  conversation,
  inputSectionOffset,
  replyInfo,
  setReplyInfo,
}) => {
  const { id: conversationId } = useParams();

  const currentUser = useStore((state) => state.currentUser);

  const scrollBottomRef = useRef<HTMLDivElement>(null);

  const [limitCount, setLimitCount] = useState(10);

  const { data, loading, error } = useCollectionQuery(
    `conversation-data-${conversationId}`,
    query(
      collection(db, "conversations", conversationId as string, "messages"),
      orderBy("createdAt")
    )
  );

  const dataRef = useRef(data);
  const conversationIdRef = useRef(conversationId);
  const isWindowFocus = useRef(true);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (isWindowFocus.current) updateSeenStatus();

    scrollBottomRef.current?.scrollIntoView();

    setTimeout(() => {
      scrollBottomRef.current?.scrollIntoView();
    }, 100);
  }, [data?.docs?.slice(-1)?.[0]?.id || ""]);

  const updateSeenStatus = () => {
    if (dataRef.current?.empty) return;

    const lastDoc = dataRef.current?.docs?.slice(-1)?.[0];

    if (!lastDoc) return;

    updateDoc(doc(db, "conversations", conversationIdRef.current as string), {
      [`seen.${currentUser?.uid}`]: lastDoc.id,
    });
  };

  useEffect(() => {
    const focusHandler = () => {
      isWindowFocus.current = true;

      updateSeenStatus();
    };

    const blurHandler = () => {
      isWindowFocus.current = false;
    };

    addEventListener("focus", focusHandler);
    addEventListener("blur", blurHandler);

    return () => {
      removeEventListener("focus", focusHandler);
      removeEventListener("blur", blurHandler);
    };
  }, []);

  const deleteConversation = async () => {
    try {
      // Construct a reference to the document
      const documentRef = doc(db, "conversations", conversationId);

      // Delete the document
      await deleteDoc(documentRef);

      console.log("Document successfully deleted before unload.");
    } catch (error) {
      console.error("Error deleting document before unload:", error);
      // Handle error appropriately
    }
  };

  useEffect(() => {
    const handleBeforeUnload = async (event) => {
      await deleteConversation();

      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      // Clean up the event listener when the component unmounts
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  if (loading)
    return (
      <div className="flex flex-grow items-center justify-center">
        <Spin />
      </div>
    );

  if (error)
    return (
      <div className="flex-grow">
        <p className="mt-4 text-center text-gray-400">Something went wrong</p>
      </div>
    );

  if (data?.empty)
    return (
      <div className="flex-grow">
        <p className="mt-4 text-center text-gray-400">
          No message recently. Start chatting now.
        </p>
      </div>
    );

  function encode(str: any) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }

  const getBundlesFromLocalStorage = () => {
    try {
      const keysJSON = localStorage.getItem("bundles");
      return keysJSON ? JSON.parse(keysJSON) : null;
    } catch (error) {
      console.error("Error retrieving bundles from local storage:", error);
      return null;
    }
  };

  const getBundle = (uid: any) => {
    const bundles = getBundlesFromLocalStorage();

    for (const bundle of bundles) {
      if (bundle != null && bundle.uid === uid) {
        return bundle;
      }
    }
  };

  function kdf(input: any, keyLength: any) {
    return CryptoJS.PBKDF2(CryptoJS.lib.WordArray.create(input), "TarChat", {
      keySize: keyLength * 4,
      iterations: 10,
    }).toString(CryptoJS.enc.Base64);
  }

  function RatchetKDF(input: any) {
    const key = kdf(input, 64);

    return {
      key1: key.slice(0, 32),
      key2: key.slice(32, 64),
    };
  }

  const tickDHRatchet = (combinedKey: any) => {
    const keys = RatchetKDF(combinedKey);
    ratchetStates.DHRoot = keys.key1;
    return keys.key2;
  };

  const tickReceiverRatchet = (combinedKey: any) => {
    const keys = RatchetKDF(combinedKey);
    ratchetStates.ReceiverRoot = keys.key1;
    return keys.key2;
  };

  const getSentMessagesFromLocalStorage = () => {
    try {
      const keysJSON = localStorage.getItem("sentMessages");
      return keysJSON ? JSON.parse(keysJSON) : null;
    } catch (error) {
      console.error("Error retrieving sentMessages from local storage:", error);
      return null;
    }
  };

  const decrypytMessage = (messageBundle: any) => {
    let receiverRatchetRoot = ratchetStates.ReceiverRoot;

    if (ratchetStates.receivedCount === 0) {
      ratchetStates.DHValues = sodium.crypto_kx_keypair();

      const DHvalue = sodium.crypto_kx_client_session_keys(
        ratchetStates.DHValues.publicKey,
        ratchetStates.DHValues.privateKey,
        messageBundle.DHPublicKey
      );

      const combinedKey = new Uint8Array([
        ...encode(DHvalue),
        ...encode(ratchetStates.DHRoot),
      ]);

      console.log(combinedKey);

      receiverRatchetRoot = tickDHRatchet(combinedKey);
    }

    const decryptionKey = tickReceiverRatchet(receiverRatchetRoot);
    console.log("DECRYPTION KEY:", decryptionKey);

    const decryptedMessage = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      messageBundle.encryptedMessage,
      messageBundle.AD,
      messageBundle.nonce,
      decryptionKey
    );

    return new TextDecoder().decode(decryptedMessage);
  };

  const decryptFirstMessage = (
    senderBundle: any,
    listenerBundle: any,
    messageBundle: any
  ) => {
    const SK = generateSK(
      senderBundle,
      listenerBundle,
      messageBundle.ephemeralKey
    );

    console.log(SK);

    ratchetStates.DHRoot = SK;

    return decrypytMessage(messageBundle);
  };

  const decrypytContent = (content: any) => {
    const listenerBundle = decodeBase64PropsToUint8Array(
      getBundle(currentUser?.uid)
    );
    const senderUidIndex = conversation.users.indexOf(currentUser?.uid);
    const senderUid = conversation.users[(senderUidIndex + 1) % 2];
    const senderBundle = decodeBase64PropsToUint8Array(getBundle(senderUid));

    const messageBundle = decodeBase64PropsToUint8Array(content);

    let decryptedMessage = "";

    if (data?.docs.length === 1) {
      decryptedMessage = decryptFirstMessage(
        senderBundle,
        listenerBundle,
        messageBundle
      );
    } else {
      decryptedMessage = decrypytMessage(messageBundle);
    }

    ratchetStates.receivedCount += 1;

    console.log(decryptedMessage);
    return decryptedMessage;
  };

  let sentMessages: any[] = [];
  let receivedMessages: any[] = [];

  return (
    <InfiniteScroll
      dataLength={data?.size as number}
      next={() => setLimitCount((prev) => prev + 10)}
      inverse
      hasMore={(data?.size as number) >= limitCount}
      loader={
        <div className="flex justify-center py-3">
          <Spin />
        </div>
      }
      style={{ display: "flex", flexDirection: "column-reverse" }}
      height={`calc(100vh - ${144 + inputSectionOffset}px)`}
    >
      <div className="flex flex-col items-stretch gap-3 pt-10 pb-1">
        {data?.docs
          .map((doc) => {
            const messageItem = { id: doc.id, ...doc.data() } as MessageItem;

            sentMessages = getSentMessagesFromLocalStorage()?.reverse();
            receivedMessages =
              getItemFromLocalStorage(
                "ratchetStates"
              )?.decryptedMessagePlaintexts.reverse();

            return messageItem;
          })
          .map((item, index) => {
            console.log(ratchetStates.decryptedMessagePlaintexts);
            console.log(receivedMessages);
            console.log(item);
            if (item.sender == currentUser?.uid) {
              item.content = sentMessages.pop();
            } else if (!ratchetStates.decryptedMessageIds.has(item.id)) {
              console.log(1);
              storeItemLocally("listenerDHPK", item.content.DHPublicKey);
              const decrypytedMessage = decrypytContent(item.content);
              item.content = decrypytedMessage;
              ratchetStates.decryptedMessageIds.add(item.id);
              ratchetStates.decryptedMessagePlaintexts.push(decrypytedMessage);
            } else {
              console.log(2);
              item.content = receivedMessages.pop();
            }

            storeItemLocally("ratchetStates", ratchetStates);

            console.log(item.content);

            return (
              <Fragment key={item.id}>
                {item.sender === currentUser?.uid ? (
                  <RightMessage
                    replyInfo={replyInfo}
                    setReplyInfo={setReplyInfo}
                    message={item}
                  />
                ) : (
                  <LeftMessage
                    replyInfo={replyInfo}
                    setReplyInfo={setReplyInfo}
                    message={item}
                    index={index}
                    docs={data?.docs}
                    conversation={conversation}
                  />
                )}
                {Object.entries(conversation.seen).filter(
                  ([key, value]) =>
                    key !== currentUser?.uid && value === item.id
                ).length > 0}
              </Fragment>
            );
          })}
        <div ref={scrollBottomRef}></div>
      </div>
    </InfiniteScroll>
  );
};

export default ChatView;
function firestore() {
  throw new Error("Function not implemented.");
}
