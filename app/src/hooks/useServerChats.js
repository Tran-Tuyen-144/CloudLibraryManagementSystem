import { useEffect, useState } from "react";
import { request } from "../api/runtime.js";
import { setNotice } from "../ui/libraryStore.js";
export default function useServerChats() {
  const [chats, setChats] = useState([]);
  useEffect(() => {
    let active = true;
    request("/chat/sessions")
      .then((result) => {
        if (active) setChats(result.items);
      })
      .catch((error) => setNotice(error.message));
    return () => {
      active = false;
    };
  }, []);
  return [chats, setChats];
}
