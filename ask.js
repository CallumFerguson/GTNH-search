import OpenAI from "openai";
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const videoTitle = "GTNH S02E10: assembly line automation";

const videoTranscript = `
welcome back today we are going to enter
the Luv tier to do that the first thing
we have to do is build an assembly line
This is a multiblock which is rather
complex to use but let's start by
crafting its parts crafting those
components is not easy nor cheap and
even our automatic crafting system has
issues with it the main problem is that
we do not have a crafting unit capable
of handling that amount of materials so
we first make some more storage we
should also make some crafting
co-processor to speed up the crafting
process and once we have added some new
and more powerful crafting units we can
finally start working on our assembly
line Parts this is going to take some
time so we can do some other things such
as farming with us while we wait we will
need those nether Stars later on however
after our brief hunting we find out that
our crafting system hasn't made much
progress and the main issue seems to be
that our processor can't keep up with
all the items it has to move around the
various
machines we could increase the amount of
core processors but the best solution is
to reduce the amount of tasks are
processor has to do we can multiply the
amount of materials in the patterns so
that instead of moving 64 times one dust
to the furnace the processor will just
move a stack of dusts once and and while
at it we can also equip our furnace with
better coils so that it will cook more
stuff at
once after editing the patterns and
restarting the crafting job we can see
the difference in the speed at which
items are being moved to the
machines and after not much time we can
see that our crafting processes are
idling the reason is that we are
crafting thousands of SMD components in
a small assembler 16 at a time
and each batch also takes quite some
time we have already split the load
across different assemblers but it
doesn't make a noticeable difference
even though four assemblers should be
four times faster than
one we could use a higher tier assembler
but the power consumption would grow
exponentially so we need a multiblock
the first option is the grig tech Plus+
1 but that requires zpm stuff that we
don't have access to yet
the second option is to parallelize a
stack of assemblers inside a processing
array however that machine doesn't scale
well when we will need to further
upgrade
it the third option is using in normal
mode the Precision assembler we crafted
last
episode the issue was that the casings
of its structure required an Luv
assembler to be
crafted however if we want it to work in
normal mode we can use the lower tier
casings the imprecise ones that way the
assembler will fully live to its
name after preparing the patterns we
craft just the minimal amount required
to form the structure and to make that
thing work fast we shall have a 16 amps
energy hatch that way it will work twice
as fast as 16 IV
assemblers and you can already see how
charging its personal buffer takes a
tool on our main battery once everything
is ready ready we assemble the assembler
structure we fill all the non-mandatory
casings with cheap buses and now we can
turn that thing on and see how little it
takes now to make hundreds of
smts the last bottleneck is our circuit
assemblers so we add a couple more one
for each circuit step and then we can
take a break and AFK a
bit or maybe we could just Farm more NE
Stars after the a quick break our
assembly line is ready this multiblock
can be built with different lengths
every additional slice adds space for
one more input
item we can also rotate it using a
wrench to build it vertically and have
it use less
space and for the moment we are going to
build one of medium
length we quickly add the energy input
and then we move to the bottom where we
will have to plan a way of automating
that thing
since each items goes in a different
slice we use the smallest buses to push
items
up to fill the items in we use a
dedicated ae2 Network where we drop
items inside an interface and they get
moved with storage buses to the
machine and if we do not want things to
go into random places we have to sort
the storage bus's
priorities we are not sorting the it
items with a filtering mechanism because
many recipes require the same items but
in a different location
layout once we have fully configured the
priorities we add an interface connected
to our main Network to automate the
crafting
requests now we can slip inside a
crafting pattern and see if everything
works as
expected once all the materials are
prepared they are correctly inserted
into the slots
however once we tried to turn on the
assembly line we realize we have
forgotten
something other than the crafting
materials the machine also need the
instructions on how to build things to
get those we have to do some research by
scanning the lower tier of the thing we
want to assemble we quickly move to our
EV scanner to do that and we find out it
will take a quarter of hour to get the
instructions for our assembly line and
we have have to do that for every Luv
component anyways once our research is
done we can bring the data to the
assembly line which will finally start
working one motor is almost useless so
we shall start crafting
more but while it looked like everything
was fine one big issue was starting to
build
up the items are being pushed to the
assembly line and since some buses were
already already filled the Overflow went
to the wrong input
slices to avoid such thing we have to
add a blocking card to the assembly line
Network and enable blocking mode on the
interface with a
pattern and with that we can see that
the motors are being crafted one at a
time with everything being perfectly
dosed now we can scan the other
components and bring the data to the
assembly line however there is only one
space in the assembly line
controller but we can add a day to
access hatch to increase that
amount the next issue is that some
components have too many ingredients to
fit our pattern
terminal of those we manually craft just
the bare minimum amount to upgrade our
pattern terminal to a fluid processing
pattern
terminal this one has 32 input slots
instead of nine more than enough for any
assembly line
recipe we quickly drop in the new
patterns and now we can move on to the
next
quest which is probably going to be in
the previous tier to reach new planets
with new
materials and that means crafting a new
rocket whose plates must now be
assembled in an assembly
line we quickly set up the new crafting
patterns but then we run into a new
issue everything got stuck because the
plates did not split into the two
buses to fix that issue we are going to
use one simple solution we prepare some
molds that will rename the parts before
sending them to the assembly
line to use it we make a pattern that
with help of a presson the previously
made mold will rename the
[Music]
items now we can edit the plate pattern
to use the two different items that
won't
merge and with that we can now start
making complex assembly line recipes in
an easy
way once everything is in the correct
place we can start crafting our rocket
plates which we use to make the tier
four
rocket while that is being built we can
also prepare a new kind of Miner the or
drilling
plant that is the multi-block version of
the small miners it has several Buffs
but it requires to move a bigger
structure and need Drilling fluid to
work and while that is crafting we can
get a better tool for locating minerals
an electric
prospector this thing can also be used
to check the pollution in our
base but its main usage is to see the
disposition of underground
resources and once we locate a good
mining spot we can build the or drilling
plant which is going to mine all the
minerals in a huge area one chunk at a
time layer by
layer and to avoid getting overwhelmed
by its output we can throttle it by
decreasing the amount of drilling fluid
we
send and now we are ready to start
working on the Luv tier but that's for
the next episode bye-bye
`;

const prompt = `
I’m trying to make an app where users can ask questions about the minecraft modpack gregtech new horizons (GTNH). A lot of the best information about GTNH is found in youtube videos. I’m making a vector database that uses the transcripts of videos. The problem is the transcripts are often from long lets play style videos, and are not very information dense. Your job is to look at the video transcript, and create chunks of data from it. These chunks should contain useful bits of information about GTNH that can be embedded and searched in a vector database. The chunks can be things like facts, tips and tricks, details about how to automate a machine, the best way to do certain things in GTNH, etc. The chunks should be things you learned about GTNH from watching the video, not a summary of the video.

Format the chunks of data as a json array where each item is just a string, not an object. Only return the json, do not include any additional text in your response.

The title of the video is “${videoTitle}”

And here is the video transcript:

${videoTranscript}
`;

const completion = await client.chat.completions.create({
    model: 'o3-mini',
    messages: [
        {
            role: 'user', content: prompt
        },
    ],
});

const result = completion.choices[0].message.content;
console.log(result);
fs.writeFileSync('result.txt', result, err => {
    if (err) {
        console.error(err);
    } else {
        // file written successfully
    }
});
