// deno-lint-ignore-file camelcase
import {
  assert,
  assertEquals,
  assertThrowsAsync,
} from "https://deno.land/std@0.100.0/testing/asserts.ts";
import { Stub, stub } from "https://deno.land/x/mock@v0.9.5/mod.ts";
import { withMockedFetch } from "../http/http.test.ts";
import {
  gitlabIssueTemplate,
  GitlabIssueTemplateValues,
} from "./../messages.ts";
import Gitlab from "./gitlab.ts";
import { Branch, GitlabProject, ImportStatus, Issue, User } from "./types.ts";

const gitlab = () =>
  new Gitlab(
    "gitlabToken",
    "templateNamespace",
    "homeworkNamespace",
  );

Deno.test("getHomeworkProject makes correct api call", async () => {
  await withMockedFetch(
    (input, init) => {
      assertEquals(
        input,
        `${Gitlab.BASE_URL}/groups/templateNamespace/projects?search=b`,
      );
      assertEquals(init?.method, "GET");
      const body: GitlabProject[] = [
        {
          name: "a",
          id: "idA",
          web_url: "",
        },
        {
          name: "b",
          id: "idB",
          web_url: "",
        },
      ];
      return new Response(JSON.stringify(body));
    },
    async () => {
      const project = await gitlab().getHomeworkProject("b");
      assertEquals(project?.name, "b");
    },
  );
});

Deno.test("waitForForkFinish makes correct api call", async () => {
  await withMockedFetch(
    (input, init) => {
      assertEquals(input, `${Gitlab.BASE_URL}/projects/forkId/import`);
      assertEquals(init?.method, "GET");
      console.log(input);

      const body: ImportStatus = { import_status: "finished" };
      return new Response(JSON.stringify(body));
    },
    async () => {
      await gitlab().waitForForkFinish("forkId");
    },
  );
});

Deno.test("waitForForkFinish retries", async () => {
  let retryCount = 0;
  await withMockedFetch(
    () => {
      retryCount += 1;

      const body: ImportStatus = { import_status: "started" };
      return new Response(JSON.stringify(body));
    },
    async () => {
      await assertThrowsAsync(() => gitlab().waitForForkFinish("forkId"));
    },
  );

  assert(retryCount > 1);
});

Deno.test("waitForForkFinish resolves", async () => {
  let retryCount = 0;
  await withMockedFetch(
    () => {
      retryCount += 1;

      const body: ImportStatus = {
        import_status: retryCount > 5 ? "finished" : "started",
      };
      return new Response(JSON.stringify(body));
    },
    async () => {
      await gitlab().waitForForkFinish("forkId");
    },
  );
});

Deno.test("getBranches makes correct api call", async () => {
  await withMockedFetch(
    (input, init) => {
      assertEquals(input, `${Gitlab.BASE_URL}/projects/id/repository/branches`);
      assertEquals(init?.method, "GET");
      const body: Branch[] = [{ name: "main", protected: true, default: true }];
      return new Response(JSON.stringify(body));
    },
    async () => {
      const branches = await gitlab().getBranches({
        name: "name",
        id: "id",
        web_url: "",
      });
      assertEquals(branches, [
        {
          name: "main",
          protected: true,
          default: true,
        },
      ]);
    },
  );
});

Deno.test("addMaintainerToProject makes correct api call", async () => {
  await withMockedFetch(
    (_, init) => {
      assertEquals(
        init?.body,
        JSON.stringify({
          id: "projectId",
          user_id: "userId",
          access_level: 30,
          expires_at: "2000-02-01",
        }),
      );
      return new Response();
    },
    async () => {
      await gitlab().addMaintainerToProject(
        "projectId",
        "userId",
        new Date("2000-02-01"),
      );
    },
  );
});

Deno.test("forkHomework makes correct api call", async () => {
  const gitlabInstance = gitlab();
  const waitForForkFinishStub: Stub<Gitlab> = stub(
    gitlabInstance,
    "waitForForkFinish",
  );
  const unprotectAllBranchesStub: Stub<Gitlab> = stub(
    gitlabInstance,
    "unprotectAllBranches",
  );
  await withMockedFetch(
    (input, init) => {
      assertEquals(input, `${Gitlab.BASE_URL}/projects/projectId/fork`);
      assertEquals(init?.method, "POST");
      assertEquals(
        init?.body,
        JSON.stringify({
          namespace_id: "homeworkNamespace",
          name: "repoName",
          path: "repoName",
        }),
      );
      return new Response(
        JSON.stringify({
          name: "repoName",
          id: "projectId",
          web_url: "",
        }),
      );
    },
    async () => {
      const homeworkFork = await gitlabInstance.forkHomework(
        "projectId",
        "repoName",
      );
      assertEquals(homeworkFork, {
        name: "repoName",
        id: "projectId",
        web_url: "",
      });
      assert(
        waitForForkFinishStub.calls.length == 1,
        "waitForForkFinish has not been called exactly once",
      );
      assert(
        unprotectAllBranchesStub.calls.length == 1,
        "unprotectAllBranches has not been called exactly once",
      );
    },
  );
});

Deno.test("unprotectBranch makes correct api call", async () => {
  await withMockedFetch((input, init) => {
    assertEquals(
      input,
      `${Gitlab.BASE_URL}/projects/projectId/protected_branches/branchName`,
    );
    assertEquals(init?.method, "DELETE");
    return new Response();
  }, async () => {
    await gitlab().unprotectBranch(
      { name: "projectName", id: "projectId", web_url: "" },
      { name: "branchName", protected: true, default: true },
    );
  });
});

Deno.test("deleteProject makes correct api call", async () => {
  await withMockedFetch((input, init) => {
    assertEquals(
      input,
      `${Gitlab.BASE_URL}/projects/projectId`,
    );
    assertEquals(init?.method, "DELETE");
    return new Response();
  }, async () => {
    await gitlab().deleteProject(
      "projectId",
    );
  });
});

Deno.test("getUser makes correct api call", async () => {
  const user1: User = {
    id: 1234,
    username: "username1",
    name: "",
  };
  const user2: User = {
    id: 1235,
    username: "username2",
    name: "",
  };
  await withMockedFetch((input, init) => {
    assertEquals(
      input,
      `${Gitlab.BASE_URL}/users?username=Username2`,
    );
    assertEquals(init?.method, "GET");
    return new Response(JSON.stringify([user1, user2]));
  }, async () => {
    const response = await gitlab().getUser("Username2");
    assertEquals(response, user2);
  });
});

Deno.test("createHomeworkIssue makes correct api call", async () => {
  const issueTemplateValues: GitlabIssueTemplateValues = {
    title: "title",
    applicantName: "name",
  };

  const issue: Issue = {
    title: "title",
    assignee: {
      id: 1,
      name: "",
      username: "",
    },
    web_url: "",
  };

  await withMockedFetch((input, init) => {
    assertEquals(
      input,
      `${Gitlab.BASE_URL}/projects/projectId/issues`,
    );
    assertEquals(init?.method, "POST");
    assertEquals(
      init?.body,
      JSON.stringify({
        title: "title",
        description: gitlabIssueTemplate(issueTemplateValues),
        assignee_ids: "gitlabUserId",
        due_date: "2020-01-01",
      }),
    );
    return new Response(JSON.stringify(issue));
  }, async () => {
    const response = await gitlab().createHomeworkIssue(
      "projectId",
      "gitlabUserId",
      new Date("2020-01-01"),
      issueTemplateValues,
    );
    assertEquals(response, issue);
  });
});
