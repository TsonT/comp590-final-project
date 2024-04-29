import React, { FC, useState } from "react";
import { ConversationInfo } from "../../shared/types";
import ConversationSettings from "./ConversationSettings";
import { Link } from "react-router-dom";
import Skeleton from "../Skeleton";
import ViewGroup from "../Group/ViewGroup";
import ViewMedia from "../Media/ViewMedia";
import { useStore } from "../../store";
import { useUsersInfo } from "../../hooks/useUsersInfo";
import { db } from "../../shared/firebase";
import { doc, getDoc } from "@firebase/firestore";
import { decodeBase64PropsToUint8Array } from "../../shared/utils";

interface ChatHeaderProps {
  conversation: ConversationInfo;
}

const ChatHeader: FC<ChatHeaderProps> = ({ conversation }) => {
  const { data: users, loading } = useUsersInfo(conversation.users);
  const currentUser = useStore((state) => state.currentUser);

  const filtered = users?.filter((user) => user.id !== currentUser?.uid);

  const [isPopupOpen, setIsPopupOpen] = useState(false); // State for controlling popup visibility
  const [popupContent, setPopupContent] = useState<string>(""); // State to store the content for the popup

  const fetchBundle = async (UId: any) => {
    try {
      const UIdDocRef = doc(db, "users", UId);

      const UIdDocSnapshot = await getDoc(UIdDocRef);

      if (!UIdDocSnapshot.exists()) {
        console.log("UId document does not exist");
      }

      const bundleWithBase64 = UIdDocSnapshot.data().bundle;

      const bundle = decodeBase64PropsToUint8Array(bundleWithBase64);

      return bundle;
    } catch (error) {
      console.error("Error fetching messages:", error);
      return []; // Return an empty array if there's an error
    }
  };

  // Async function to fetch data
  const fetchData = async () => {
    try {
      const bundle1 = await fetchBundle(conversation.users[0]);
      const bundle2 = await fetchBundle(conversation.users[1]);

      const concatenatedIdentityKeys = Uint8Array.of(
        ...bundle1.identityKey,
        ...bundle2.identityKey
      );

      setPopupContent(concatenatedIdentityKeys.toString().replace(/,/g, "  "));
    } catch (error) {
      // Handle errors
      console.error("Error fetching data:", error);
      // Update popup content with error message
      setPopupContent("Error fetching data");
    }
  };

  return (
    <>
      <div className="border-dark-lighten flex h-20 items-center justify-between border-b px-5">
        <div className="flex flex-grow items-center gap-3">
          <Link to="/" className="md:hidden">
            <i className="bx bxs-chevron-left text-primary text-3xl"></i>
          </Link>
          {loading ? <Skeleton className="h-10 w-10 rounded-full" /> : <></>}

          {loading ? (
            <Skeleton className="h-6 w-1/4" />
          ) : (
            <div className="flex items-center gap-3">
              <p>
                {conversation.users.length > 2 && conversation?.group?.groupName
                  ? conversation.group.groupName
                  : filtered
                      ?.map((user) => user.data()?.displayName)
                      .slice(0, 3)
                      .join(", ")}
              </p>
              <button
                onClick={async () => {
                  // Call the async function when the button is clicked
                  setIsPopupOpen(true);
                  await fetchData();
                }}
                className="bg-dark-lighten flex h-8 w-8 items-center justify-center rounded-full text-white"
              >
                <img
                  src="../../../public/lock_image.png"
                  alt="Picture Button"
                  style={{ width: "40%", height: "50%", objectFit: "cover" }}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Popup/Modal */}
      {isPopupOpen && (
        <div
          onClick={() => setIsPopupOpen(false)}
          className="fixed top-0 left-0 z-20 flex h-full w-full items-center justify-center bg-[#00000080]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-dark mx-3 w-full max-w-[500px] overflow-hidden rounded-lg"
          >
            <div className="border-dark-lighten flex items-center justify-between border-b py-3 px-3">
              <div className="flex-1"></div>
              <div className="flex flex-1 items-center justify-center">
                <h1 className="whitespace-nowrap text-center text-2xl">
                  Verify Conversation
                </h1>
              </div>
              <div className="flex flex-1 items-center justify-end">
                <button
                  onClick={() => setIsPopupOpen(false)}
                  className="bg-dark-lighten flex h-8 w-8 items-center justify-center rounded-full"
                >
                  <i className="bx bx-x text-2xl"></i>
                </button>
              </div>
            </div>
            <div className="p-3">
              <p style={{ maxWidth: "100%", overflowWrap: "break-word" }}>
                {
                  "Verify your conversation with the other party by comparing the following string of numbers and ensure that they are the same:"
                }
              </p>
            </div>
            <div className="p-3">
              <p style={{ maxWidth: "100%", overflowWrap: "break-word" }}>
                {popupContent}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatHeader;
