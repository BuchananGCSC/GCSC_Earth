# Making and publishing a lesson

You do not need to edit any files by hand. The site has a lesson editor.

**Editor:** https://buchanangcsc.github.io/GCSC_Earth/editor/

Students never see the editor. It is the same globe with an extra **Editor** tab.

## Write a lesson

1. Open the editor. Give the lesson a **title** and a **one-line summary**.
2. On the **Controls** tab, set the globe up the way students should first see it: the world, the picture,
   anything added to the globe, 3D terrain, and the view itself.
3. Back on the **Editor** tab, press **Add a stop with the current view**. The editor stores everything about
   the globe at that moment.
4. Type the stop's **title**, its **reading** (leave a blank line between paragraphs) and its **questions**.
5. Repeat for each stop. Use the arrows to reorder stops and the × to delete one.
6. To change a stop's view later, select the stop, move the globe, and press **Use the current view**.
7. Press **Preview as a student** to walk through the lesson exactly as students will. **Leave the lesson**
   brings you back to the editor.

Your draft is kept in the browser you are using, so closing the tab does not lose it. It is not saved anywhere
else until you press **Save lesson file**.

The **Check and save** list shows anything missing. Red items must be fixed before saving; yellow items are
reminders.

## Use it straight away, without publishing

Press **Copy a link that runs this lesson**. The link carries the whole lesson inside it. Post it in your LMS
or email it, and anyone who opens it gets the lesson.

- The lesson is **not** added to the site's lesson list. Only people with the link see it.
- The link is a **snapshot**. If you edit the lesson later, make a new link.
- The link is long: about 2,500 characters for a six-stop lesson. That is fine in an LMS or an email. If you plan
  to post it somewhere new, open it from there once to check it was not cut short.
- On screen, students see "Lesson from a link" above the title, so it is clear it did not come from the site's
  own list.
- Keep the saved lesson file as well. The file is what you reopen to edit; the link is only for running it.

Any teacher can make and share lessons this way with no GitHub account.

## Put it on the site

1. Press **Save lesson file**. A file such as `rivers-and-deltas.json` goes to your Downloads folder.
2. Open the lessons folder on GitHub and sign in:
   https://github.com/BuchananGCSC/GCSC_Earth/upload/main/app/activities
3. Drag the file onto that page.
4. Press the green **Commit changes** button.
5. Wait about a minute and reload the site. The lesson is in the lesson list.

The link to hand out is the site address plus `#act=` and the file name, for example
`https://buchanangcsc.github.io/GCSC_Earth/#act=rivers-and-deltas`.

## Change a lesson that is already on the site

1. In the editor, choose it under **Open a lesson from the site…**.
2. Make your changes and press **Save lesson file**. Keep the same file name.
3. Upload it the same way. GitHub replaces the old file.

## Remove a lesson

On GitHub, open the file in `app/activities`, press the **…** menu at the top right, choose **Delete file**, and
commit. The lesson leaves the list about a minute later.

## Good to know

- **The order of the list** follows each lesson's "Place in the list" number, lowest first.
- **A broken file cannot take the site down.** If an uploaded file cannot be read, it is left out of the list and
  the other lessons keep working. The reason appears as a warning on the repository's Actions page.
- **Work on a lesson across computers** by saving the file and using **Open a file…** on the other computer.
- **Wording:** write for intro-level students. Short sentences, one idea per paragraph, define a term the first
  time it appears, and ask for an observation before asking for an explanation.

The file format itself is described in [activities.md](activities.md), for anyone who wants to edit by hand.
