import json,time,psutil,signal,hashlib
from pathlib import Path
pid=47217;ctime=1793636361.93;parent=47202
out=Path('/tmp/kw-text-block19-options-20261102-resource-watch.json');started=time.monotonic();samples=[]
r={'scope':'Resource observer for the exact already-owned bounded diagnostic Node PID and creation time only; VAE processes are excluded. Working-set estimate includes tmpfs. Not a model numerical source.','nodePid':pid,'nodeCreationTime':ctime,'parentPidAtAttachment':parent,'workingSetStopBytes':16400000000,'signals':[],'samples':samples}
try:
 p=psutil.Process(pid);assert p.create_time()==ctime and p.ppid()==parent
 while time.monotonic()-started<300:
  try:
   if p.create_time()!=ctime:break
   if p.status()==psutil.STATUS_ZOMBIE:time.sleep(.1);continue
   stat=dict((k,int(v))for k,v in (line.split()for line in Path('/sys/fs/cgroup/memory.stat').read_text().splitlines()));charge=int(Path('/sys/fs/cgroup/memory.current').read_text());working=charge-stat.get('inactive_file',0)
   samples.append({'elapsedSeconds':time.monotonic()-started,'nodeRssBytes':p.memory_info().rss,'cgroupChargeBytes':charge,'workingSetEstimateBytes':working})
   if working>r['workingSetStopBytes'] and not r['signals']:
    p.send_signal(signal.SIGTERM);r['signals'].append({'signal':'SIGTERM','reason':'working-set stop threshold','workingSetEstimateBytes':working})
   time.sleep(.2)
  except psutil.NoSuchProcess:break
 try:r['finalNodeStatus']=p.status() if p.create_time()==ctime else 'PID_REUSED'
 except psutil.NoSuchProcess:r['finalNodeStatus']='GONE'
finally:
 r['wallSeconds']=time.monotonic()-started;r['observerSourceSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();out.write_text(json.dumps(r,indent=2)+'\n')
 print(json.dumps({k:v for k,v in r.items()if k!='samples'}))
