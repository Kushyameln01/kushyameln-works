"""Long-profile scalar acceptance around the existing complete-media oracle."""
from fractions import Fraction
import hashlib


def need(value, message):
    if not value:
        raise ValueError(message)


def expected_events(frames):
    need(type(frames) is int and 0 < frames <= 100000, 'LONG_EVENT_FRAME_COUNT')
    count = 0; digest = hashlib.sha256()
    for index in range(frames):
        if index % 300 in (29, 30, 31):
            count += 1; digest.update(str(index).encode() + b'\n')
    return {'countPerEye': count, 'sequenceSHA256': digest.hexdigest(), 'periodFrames': 300, 'offsets': [29, 30, 31]}


def aggregate_packets(records, time_base, *, max_payload_bytes, expected_frames, input_side):
    """Full EOF scalar scan. Never retain packet/timestamp arrays."""
    base = Fraction(time_base); need(base > 0, 'LONG_PACKET_TIMEBASE')
    count = total = maximum = 0; first = end = previous_dts = None
    for packet in records:
        need(count < 100000, 'LONG_PACKET_COUNT')
        size = int(packet['size']); pts = int(packet['pts']) * base
        dts = int(packet['dts']) * base; duration = int(packet['duration']) * base
        need(0 < size <= 4 * 1024 ** 2 and duration > 0, 'LONG_PACKET_SIZE_DURATION')
        need(previous_dts is None or dts >= previous_dts, 'LONG_DECODE_ORDER')
        if input_side:
            need(abs(pts - Fraction(count, 30)) <= Fraction(1, 1_000_000)
                 and abs(duration - Fraction(1, 30)) <= Fraction(1, 1_000_000), 'LONG_GENERATED_CFR_GRID')
        previous_dts = dts; count += 1; total += size; maximum = max(maximum, size)
        need(total <= max_payload_bytes, 'LONG_PACKET_PAYLOAD_CAP')
        first = pts if first is None else min(first, pts); end = pts + duration if end is None else max(end, pts + duration)
    need(count == expected_frames and count > 0 and end > first, 'LONG_PACKET_FINAL_COUNT')
    duration = end - first
    return {'packets': count, 'payloadBytes': total, 'maxPacketBytes': maximum, 'timeBase': str(base),
            'firstPtsRational': str(first), 'endPtsRational': str(end), 'timelineSecondsRational': str(duration),
            'timelineSeconds': float(duration), 'actualPayloadBitsPerSecond': float(total * 8 / duration)}


def long_verdict(verified, packets, frames, target):
    events = expected_events(frames); observed = verified.get('events', {})
    valid = (verified.get('status') == 'PASS' and verified.get('completeScan') and verified.get('frames') == frames
             and verified.get('decodedFramesCompared') == frames and observed.get('allFrameFlagsEqual') is True
             and observed.get('inputCountByEye') == [events['countPerEye']] * 2
             and observed.get('outputCountByEye') == [events['countPerEye']] * 2
             and observed.get('inputSequenceSHA256ByEye') == [events['sequenceSHA256']] * 2
             and observed.get('outputSequenceSHA256ByEye') == [events['sequenceSHA256']] * 2
             and all(packets.get(side, {}).get('packets') == frames and packets[side].get('completeScan') for side in ('input', 'output'))
             and packets.get('input', {}).get('payloadBytes', 0) >= target)
    return {'status': 'PASS' if valid else 'FAIL', 'expectedEvents': events,
            'scope': 'All decoded frames/events/PTS and packet EOF plus actual input payload; no VR-player or real-camera acceptance.'}
