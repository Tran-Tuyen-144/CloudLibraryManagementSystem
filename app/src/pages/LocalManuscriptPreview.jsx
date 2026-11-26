import ReaderPage from "./ReaderPage";
export default function ManuscriptPreview({book,user,onBack}) {
  return <ReaderPage preview book={book} user={user} onBack={onBack} />;
}
