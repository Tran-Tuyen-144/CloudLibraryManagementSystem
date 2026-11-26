import urllib.request,concurrent.futures,pathlib,zipfile,xml.etree.ElementTree as ET,json,re,hashlib,datetime,shutil,tempfile
root=pathlib.Path(__file__).resolve().parents[1]
archive_root=root/'.local/source-downloads/standard-ebooks';archive_root.mkdir(parents=True,exist_ok=True)
stage=pathlib.Path(tempfile.mkdtemp(prefix='standard-build-',dir=archive_root))
dest=stage/'data';dest.mkdir();covers=stage/'covers';covers.mkdir()
repos=['jane-austen_pride-and-prejudice','arthur-conan-doyle_the-adventures-of-sherlock-holmes','mary-shelley_frankenstein','bram-stoker_dracula','oscar-wilde_the-picture-of-dorian-gray','h-g-wells_the-time-machine','jane-austen_sense-and-sensibility','charlotte-bronte_jane-eyre','h-g-wells_the-war-of-the-worlds','robert-louis-stevenson_treasure-island','jane-austen_persuasion','jane-austen_emma']
ns={'o':'http://www.idpf.org/2007/opf','dc':'http://purl.org/dc/elements/1.1/','x':'http://www.w3.org/1999/xhtml'}
def local(tag):return tag.rsplit('}',1)[-1]
def plain(node):
 out=[];blocks={'p','h1','h2','h3','h4','h5','h6','div','section','article','header','blockquote','li','figure','figcaption','footer','tr'}
 def walk(e):
  tag=local(e.tag)
  if tag in {'script','style','svg','img','audio','video'}:return
  if tag in blocks:out.append('\n\n')
  if tag=='br':out.append('\n')
  if e.text:out.append(re.sub(r'\s+',' ',e.text))
  for c in e:
   walk(c)
   if c.tail:out.append(re.sub(r'\s+',' ',c.tail))
  if tag in blocks:out.append('\n\n')
 walk(node)
 return re.sub(r'\n{3,}','\n\n',re.sub(r' *\n *','\n',''.join(out))).strip()
def download(repo):
 archive=archive_root/f'{repo}.zip';url=f'https://api.github.com/repos/standardebooks/{repo}/zipball/master'
 try:
  if not archive.exists():
   req=urllib.request.Request(url,headers={'User-Agent':'CloudLibrary-Local-Book-Import','Accept':'application/vnd.github+json'})
   archive.write_bytes(urllib.request.urlopen(req,timeout=45).read())
  z=zipfile.ZipFile(archive);prefix=z.namelist()[0];opf=z.read(prefix+'src/epub/content.opf');meta=ET.fromstring(opf);manifest={i.attrib['id']:i.attrib for i in meta.findall('o:manifest/o:item',ns)}
  title=meta.findtext('o:metadata/dc:title',namespaces=ns);author=', '.join(n.text for n in meta.findall('o:metadata/dc:creator',ns));language=meta.findtext('o:metadata/dc:language',namespaces=ns)
  description=meta.findtext('o:metadata/dc:description',namespaces=ns) or ''
  source=meta.findtext('o:metadata/dc:identifier',namespaces=ns)
  chapters=[];files=[]
  for ref in meta.findall('o:spine/o:itemref',ns):
   item=manifest[ref.attrib['idref']];href=item['href']
   if href in ['text/titlepage.xhtml','text/imprint.xhtml']:continue
   raw=z.read(prefix+'src/epub/'+href);tree=ET.fromstring(raw);body=tree.find('x:body',ns)
   if body is None:raise ValueError('no body '+href)
   text=plain(body)
   if not text:raise ValueError('empty spine '+href)
   heading=tree.findtext('x:head/x:title',namespaces=ns) or pathlib.PurePosixPath(href).stem
   chapter={'id':pathlib.PurePosixPath(href).stem,'title':heading,'content':text}
   if chapter['id'] in [c['id'] for c in chapters]:raise ValueError('duplicate chapter')
   chapters.append(chapter);files.append({'path':'src/epub/'+href,'sha256':hashlib.sha256(raw).hexdigest(),'characters':len(text)})
  if sum(len(c['content']) for c in chapters)<50000:raise ValueError('book too short')
  cover=z.read(prefix+'images/cover.jpg')
  if cover[:3]!=b'\xff\xd8\xff':raise ValueError('not JPEG')
  (covers/(repo+'.jpg')).write_bytes(cover)
  license=z.read(prefix+'LICENSE.md').decode();(dest/(repo+'.LICENSE.md')).write_text(license)
  book={'id':'se-'+repo,'title':title,'author':author,'category':'Văn học kinh điển','description':description,'cover':'/covers/standard-ebooks/'+repo+'.jpg','source':'standard-ebooks','sourceUrl':source,'sourceRepository':'https://github.com/standardebooks/'+repo,'language':language,'chapters':chapters,'sourceLicense':'CC0-1.0','sourceEdition':prefix.rstrip('/').rsplit('-',1)[-1],'sourceFetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  content=json.dumps(book,ensure_ascii=False,indent=2)+'\n';(dest/(repo+'.json')).write_text(content)
  entry={'id':book['id'],'file':repo+'.json','sha256':hashlib.sha256(content.encode()).hexdigest(),'title':title,'author':author,'sourceUrl':source,'repository':book['sourceRepository'],'archiveUrl':url,'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'coverSha256':hashlib.sha256(cover).hexdigest(),'chapterCount':len(chapters),'characters':sum(len(c['content']) for c in chapters),'spineFiles':files}
  print('OK',repo,len(chapters),entry['characters'],flush=True);return entry
 except Exception as e:print('FAIL',repo,repr(e),flush=True);return None
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:results=list(ex.map(download,repos))
entries=[e for e in results if e]
(dest/'manifest.json').write_text(json.dumps({'source':'Standard Ebooks public repositories','fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'books':entries},ensure_ascii=False,indent=2)+'\n')
if len(entries)!=len(repos):
 shutil.rmtree(stage)
 raise SystemExit('Import failed: at least one edition is incomplete. Existing data has been preserved.')
lines=[]
for i,e in enumerate(entries):lines.append(f'import book{i} from "./{e["file"]}" with {{ type: "json" }};')
lines.append('export const bundledBooks = ['+', '.join('book'+str(i) for i in range(len(entries)))+'];')
(dest/'books.mjs').write_text('\n'.join(lines)+'\n')
shutil.copytree(dest,root/'server/data/standard-ebooks',dirs_exist_ok=True)
shutil.copytree(covers,root/'public/covers/standard-ebooks',dirs_exist_ok=True)
shutil.rmtree(stage)
print('Imported',len(entries),'complete Standard Ebooks editions. Restart the API to sync the library.',flush=True)
